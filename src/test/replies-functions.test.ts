import { beforeEach, expect, it, vi } from "vitest";

type Row = { author: string; status: string; closed: boolean; can_reply: boolean };
type Query = { select: () => Query; eq: () => Query; maybeSingle: () => Promise<{ data: unknown; error: null }> };
const mocks = vi.hoisted(() => ({
  ai: vi.fn(),
  rpc: vi.fn(),
  own: null as unknown,
  reviewAll: false,
  admin: false,
  tracker: null as unknown,
  mine: [] as unknown[],
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
        maybeSingle: async () => ({ data: table === "messages" ? mocks.own : table === "message_trackers" ? mocks.tracker : table === "user_roles" ? (mocks.admin ? { role: "admin" } : null) : { value: mocks.reviewAll }, error: null }),
      };
      return q;
    },
  },
}));
import { answerPublicly, replyAsMember, replyAsSender, replyToMessage } from "@/lib/replies.functions";

const TOKEN = "a".repeat(43);
const allow = JSON.stringify({ verdict: "allow", category: "none", reason: "" });
type Call<A> = (args: A) => Promise<unknown>;
const sender = replyAsSender as unknown as Call<{ data: { token: string; body: string } }>;
type Member = Call<{ data: { messageId: string; body: string }; context: { userId: string; supabase: { rpc: typeof mocks.rpc } } }>;
const member = replyAsMember as unknown as Member;
const owner = replyToMessage as unknown as Call<{ data: { messageId: string; body: string }; context: { userId: string } }>;
const answer = answerPublicly as unknown as Call<{ data: { messageId: string; answer: string }; context: { userId: string } }>;
const setThread = (rows: Partial<Row>[]) => {
  mocks.thread = rows.map((r) => ({ author: "owner", status: "approved", closed: false, can_reply: true, ...r }));
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.own = { id: "m1" };
  mocks.reviewAll = false;
  mocks.admin = false;
  mocks.tracker = { token_hash: "hash-1" };
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

it("an admin's replies and public answers skip the checks", async () => {
  mocks.admin = true;
  const text = "call me +998 90 123 45 67, idiot";
  expect(await owner({ data: { messageId: "m1", body: text }, context: { userId: "admin-1" } })).toEqual({ ok: true, held: false });
  expect(await answer({ data: { messageId: "m1", answer: text }, context: { userId: "admin-1" } })).toEqual({ ok: true, held: false });
  expect(mocks.ai).not.toHaveBeenCalled();
  expect(mocks.rpc).toHaveBeenCalledWith("add_owner_reply", expect.objectContaining({ _body: text, _status: "approved" }));
  expect(mocks.rpc).toHaveBeenCalledWith("publish_answer", expect.objectContaining({ _answer: text, _status: "approved" }));
});

it("a normal student still gets the checks", async () => {
  expect(await owner({ data: { messageId: "m1", body: "call me +998 90 123 45 67" }, context: { userId: "user-1" } })).toEqual({ ok: false, code: "personal" });
});

// A signed-in sender answers from the Sent page: the thread comes from their own account and the
// stored link hash is passed to add_sender_reply.
const memberCtx = () => ({ userId: "user-1", supabase: { rpc: vi.fn(async () => ({ data: mocks.thread, error: null })) } });

it("a signed-in sender can answer from the Sent page", async () => {
  const context = memberCtx();
  expect(await member({ data: { messageId: "m1", body: "thanks!" }, context })).toEqual({ ok: true, held: false });
  expect(context.supabase.rpc).toHaveBeenCalledWith("my_sent_thread", { _message_id: "m1" });
  expect(mocks.rpc).toHaveBeenCalledWith("add_sender_reply", expect.objectContaining({ _token_hash: "hash-1", _body: "thanks!" }));
});

it("a signed-in sender cannot answer a message that is not theirs", async () => {
  mocks.tracker = null;
  expect(await member({ data: { messageId: "m1", body: "hi" }, context: memberCtx() })).toEqual({ ok: false, code: "notfound" });
  expect(mocks.ai).not.toHaveBeenCalled();
  expect(mocks.rpc).not.toHaveBeenCalledWith("add_sender_reply", expect.anything());
});

it("the Sent page follows the same turn and closed rules as the private link", async () => {
  setThread([{ closed: true }]);
  expect(await member({ data: { messageId: "m1", body: "hi" }, context: memberCtx() })).toEqual({ ok: false, code: "closed" });
  setThread([{ can_reply: false }]);
  expect(await member({ data: { messageId: "m1", body: "hi" }, context: memberCtx() })).toEqual({ ok: false, code: "turn" });
  expect(mocks.ai).not.toHaveBeenCalled();
});
