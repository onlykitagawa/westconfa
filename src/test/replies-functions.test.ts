import { beforeEach, expect, it, vi } from "vitest";

type Row = { author: string; status: string; closed: boolean; can_reply: boolean };
type Query = { select: () => Query; eq: () => Query; maybeSingle: () => Promise<{ data: unknown; error: null }> };
const mocks = vi.hoisted(() => ({
  ai: vi.fn(),
  rpc: vi.fn(),
  own: null as unknown,
  reviewAll: false,
  thread: [] as unknown[],
}));
vi.mock("@tanstack/react-start", () => {
  const builder = { middleware: () => builder, inputValidator: () => builder, handler: (fn: unknown) => fn };
  return { createServerFn: () => builder };
});
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/lib/ai-moderation.server", () => ({ callModerationAI: mocks.ai }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    rpc: mocks.rpc,
    from: (table: string): Query => {
      const q: Query = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data: table === "messages" ? mocks.own : { value: mocks.reviewAll }, error: null }),
      };
      return q;
    },
  },
}));
import { answerPublicly, replyAsSender, replyToMessage } from "@/lib/replies.functions";

const TOKEN = "a".repeat(43);
const allow = JSON.stringify({ verdict: "allow", category: "none", reason: "" });
type Call<A> = (args: A) => Promise<unknown>;
const sender = replyAsSender as unknown as Call<{ data: { token: string; body: string } }>;
const owner = replyToMessage as unknown as Call<{ data: { messageId: string; body: string }; context: { userId: string } }>;
const answer = answerPublicly as unknown as Call<{ data: { messageId: string; answer: string }; context: { userId: string } }>;
const setThread = (rows: Partial<Row>[]) => {
  mocks.thread = rows.map((r) => ({ author: "owner", status: "approved", closed: false, can_reply: true, ...r }));
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.own = { id: "m1" };
  mocks.reviewAll = false;
  setThread([{}]);
  mocks.ai.mockResolvedValue(allow);
  mocks.rpc.mockImplementation(async (name: string) => (name === "message_thread" ? { data: mocks.thread, error: null } : { data: "new-id", error: null }));
});

it("a sender with an unknown link gets nothing and costs no AI call", async () => {
  mocks.thread = [];
  expect(await sender({ data: { token: TOKEN, body: "hi" } })).toEqual({ ok: false, code: "notfound" });
  expect(mocks.ai).not.toHaveBeenCalled();
});

it("closed threads and not-your-turn threads are refused before the AI", async () => {
  setThread([{ closed: true, can_reply: false }]);
  expect(await sender({ data: { token: TOKEN, body: "hi" } })).toEqual({ ok: false, code: "closed" });
  setThread([{ author: "sender", can_reply: false }]);
  expect(await sender({ data: { token: TOKEN, body: "hi" } })).toEqual({ ok: false, code: "turn" });
  setThread([{ author: "owner", can_reply: false }, { author: "sender", status: "pending", can_reply: false }]);
  expect(await sender({ data: { token: TOKEN, body: "hi" } })).toEqual({ ok: false, code: "pending" });
  expect(mocks.ai).not.toHaveBeenCalled();
});

it("a sender reply is stored by the hash of the link, never the link itself", async () => {
  expect(await sender({ data: { token: TOKEN, body: "thank you" } })).toEqual({ ok: true, held: false });
  const call = mocks.rpc.mock.calls.find((c) => c[0] === "add_sender_reply");
  expect(call?.[1]).toMatchObject({ _body: "thank you", _status: "approved" });
  expect(call?.[1]._token_hash).toMatch(/^[0-9a-f]{64}$/);
  expect(JSON.stringify(call?.[1])).not.toContain(TOKEN);
});

it("with review-all on, a sender reply waits for a moderator", async () => {
  mocks.reviewAll = true;
  expect(await sender({ data: { token: TOKEN, body: "thank you" } })).toEqual({ ok: true, held: true });
  expect(mocks.rpc.mock.calls.find((c) => c[0] === "add_sender_reply")?.[1]).toMatchObject({ _status: "pending" });
});

it("contact details are refused and nothing is stored", async () => {
  expect(await sender({ data: { token: TOKEN, body: "call me +998 90 123 45 67" } })).toEqual({ ok: false, code: "personal" });
  expect(mocks.rpc.mock.calls.some((c) => c[0] === "add_sender_reply")).toBe(false);
});

it("blocked text is never stored", async () => {
  mocks.ai.mockResolvedValue(JSON.stringify({ verdict: "block", category: "threat", reason: "Threat." }));
  expect(await owner({ data: { messageId: "11111111-1111-4111-8111-111111111111", body: "hello" }, context: { userId: "u1" } })).toEqual({ ok: false, code: "blocked" });
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it("only the recipient can reply or post publicly", async () => {
  mocks.own = null;
  const id = "11111111-1111-4111-8111-111111111111";
  expect(await owner({ data: { messageId: id, body: "hello" }, context: { userId: "u2" } })).toEqual({ ok: false, code: "notfound" });
  expect(await answer({ data: { messageId: id, answer: "hello" }, context: { userId: "u2" } })).toEqual({ ok: false, code: "notfound" });
  expect(mocks.ai).not.toHaveBeenCalled();
});

it("a swear or threat word in an answer is held for a moderator, not posted", async () => {
  const id = "11111111-1111-4111-8111-111111111111";
  expect(await answer({ data: { messageId: id, answer: "kill you" }, context: { userId: "u1" } })).toEqual({ ok: true, held: true });
  expect(mocks.rpc).toHaveBeenCalledWith("publish_answer", expect.objectContaining({ _owner: "u1", _message_id: id, _status: "pending" }));
});

it("database refusals map to friendly codes", async () => {
  const id = "11111111-1111-4111-8111-111111111111";
  mocks.rpc.mockResolvedValue({ data: null, error: { message: "thread_closed", code: "P0001" } });
  expect(await owner({ data: { messageId: id, body: "hello" }, context: { userId: "u1" } })).toEqual({ ok: false, code: "closed" });
  mocks.rpc.mockResolvedValue({ data: null, error: { message: "duplicate key", code: "23505" } });
  expect(await answer({ data: { messageId: id, answer: "hello" }, context: { userId: "u1" } })).toEqual({ ok: false, code: "duplicate" });
});
