import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ ai: vi.fn(), store: vi.fn(), from: vi.fn(), getUser: vi.fn(), headers: {} as Record<string, string> }));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => ({ inputValidator: () => ({ handler: (fn: unknown) => fn }) }) }));
vi.mock("@tanstack/react-start/server", () => ({ getRequest: () => new Request("http://localhost", { headers: mocks.headers }) }));
vi.mock("@/lib/ai-moderation.server", () => ({ callModerationAI: mocks.ai }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: mocks.from, rpc: mocks.store, auth: { getUser: mocks.getUser } } }));
import { sendMessage } from "@/lib/messages.functions";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.headers = {};
  mocks.from.mockImplementation((table: string) => {
    const q = {
      select: () => q, eq: () => q, delete: () => q,
      gte: async () => ({ count: 0 }), lt: async () => ({}),
      maybeSingle: async () => ({ data: table === "profiles" ? { id: "recipient", inbox_paused: false, suspended: false } : { value: false }, error: null }),
    };
    return q;
  });
  mocks.store.mockResolvedValue({ error: null });
});
// The mocked builder exposes the actual handler instead of the generated RPC.
const send = sendMessage as unknown as (args: { data: { username: string; body: string } }) => Promise<unknown>;
it("blocked messages never call storage", async () => {
  mocks.ai.mockResolvedValue(JSON.stringify({ verdict: "block", category: "harassment", reason: "Harmful." }));
  expect(await send({ data: { username: "student", body: "Hello" } })).toEqual({ ok: false, code: "blocked" });
  expect(mocks.store).not.toHaveBeenCalled();
});
it("AI failures store pending atomically and return the identical success", async () => {
  mocks.ai.mockRejectedValue(new Error("Unavailable"));
  expect(await send({ data: { username: "student", body: "Hello" } })).toEqual({ ok: true });
  expect(mocks.store).toHaveBeenCalledWith("store_screened_message", expect.objectContaining({ _status: "pending", _source: "ai_error", _body: "Hello", _sender_user_id: null, _sender_network_hash: expect.any(String) }));
});it("guests store a network hash and no account; signed-in senders store their account and no hash", async () => {
  mocks.ai.mockResolvedValue(JSON.stringify({ verdict: "allow", category: null, reason: "" }));
  await send({ data: { username: "student", body: "Hi" } });
  const guest = mocks.store.mock.calls[0][1];
  expect(guest._sender_user_id).toBeNull();
  expect(guest._sender_network_hash).toMatch(/^[0-9a-f]{64}$/);
  mocks.headers = { authorization: "Bearer tok" };
  mocks.getUser.mockResolvedValue({ data: { user: { id: "sender-1" } } });
  await send({ data: { username: "student", body: "Hi" } });
  const member = mocks.store.mock.calls[1][1];
  expect(member._sender_user_id).toBe("sender-1");
  expect(member._sender_network_hash).toBeNull();
});
