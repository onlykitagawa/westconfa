import { beforeEach, expect, it, vi } from "vitest";

type Query = { select: () => Query; eq: () => Query; maybeSingle: () => Promise<{ data: unknown; error: null }> };
const mocks = vi.hoisted(() => ({ ai: vi.fn(), rpc: vi.fn(), admin: false }));
vi.mock("@tanstack/react-start", () => {
  const builder = { middleware: () => builder, inputValidator: () => builder, handler: (fn: unknown) => fn };
  return { createServerFn: () => builder };
});
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/lib/ai-moderation.server", () => ({ callModerationAI: mocks.ai }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    rpc: mocks.rpc,
    from: (): Query => {
      const q: Query = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: mocks.admin ? { role: "admin" } : null, error: null }) };
      return q;
    },
  },
}));
import { createAskAnswer, createAskPost } from "@/lib/ask.functions";
import { aiOpinion, askErrorFromDb, askErrorKey } from "@/lib/ask-rules";

type Call<A> = (args: A) => Promise<unknown>;
const post = createAskPost as unknown as Call<{ data: { body: string }; context: { userId: string } }>;
const answer = createAskAnswer as unknown as Call<{ data: { postId: string; body: string }; context: { userId: string } }>;
const verdict = (v: string) => JSON.stringify({ verdict: v, category: v === "allow" ? "none" : "other", reason: v === "allow" ? "" : "not sure" });
const ctx = { userId: "u1" };
const POST = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.admin = false;
  mocks.ai.mockResolvedValue(verdict("allow"));
  mocks.rpc.mockResolvedValue({ data: [{ id: "p1", status: "pending" }], error: null });
});

it("stores the AI's own opinion; the database decides whether it waits", async () => {
  expect(await post({ data: { body: "Best place to study?" }, context: ctx })).toEqual({ ok: true, id: "p1", held: true });
  expect(mocks.rpc).toHaveBeenCalledWith("store_ask_post", expect.objectContaining({ _author: "u1", _body: "Best place to study?", _ai_says: "allow", _trusted: false }));
  mocks.ai.mockResolvedValue(verdict("review"));
  await post({ data: { body: "Hmm" }, context: ctx });
  expect(mocks.rpc).toHaveBeenLastCalledWith("store_ask_post", expect.objectContaining({ _ai_says: "review", _reason: "not sure" }));
  mocks.ai.mockRejectedValue(new Error("down"));
  await post({ data: { body: "Hmm again" }, context: ctx });
  expect(mocks.rpc).toHaveBeenLastCalledWith("store_ask_post", expect.objectContaining({ _ai_says: "unavailable" }));
});

it("a published post is reported as not held", async () => {
  mocks.rpc.mockResolvedValue({ data: [{ id: "p2", status: "approved" }], error: null });
  expect(await post({ data: { body: "Hi" }, context: ctx })).toEqual({ ok: true, id: "p2", held: false });
});

it("contact details and blocked text never reach the database", async () => {
  expect(await post({ data: { body: "text me +998 90 123 45 67" }, context: ctx })).toEqual({ ok: false, code: "personal" });
  mocks.ai.mockResolvedValue(verdict("block"));
  expect(await answer({ data: { postId: POST, body: "something awful" }, context: ctx })).toEqual({ ok: false, code: "blocked" });
  expect(await post({ data: { body: "   " }, context: ctx })).toEqual({ ok: false, code: "empty" });
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it("admins are trusted and skip the AI", async () => {
  mocks.admin = true;
  await answer({ data: { postId: POST, body: "Official answer" }, context: ctx });
  expect(mocks.ai).not.toHaveBeenCalled();
  expect(mocks.rpc).toHaveBeenCalledWith("store_ask_answer", expect.objectContaining({ _post_id: POST, _trusted: true }));
});

it("database errors turn into friendly codes", async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: { message: "rate_limited" } });
  expect(await post({ data: { body: "Again" }, context: ctx })).toEqual({ ok: false, code: "limit" });
  mocks.rpc.mockResolvedValue({ data: null, error: { message: "not_found" } });
  expect(await answer({ data: { postId: POST, body: "Late" }, context: ctx })).toEqual({ ok: false, code: "notfound" });
  expect(askErrorFromDb("boom")).toBe("generic");
  expect(askErrorKey("duplicate" as never)).toBe("generic");
  expect(aiOpinion({ ok: true, body: "x", status: "approved", reason: "" })).toBe("allow");
});
