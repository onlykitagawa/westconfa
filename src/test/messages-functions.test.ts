import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ ai: vi.fn(), store: vi.fn(), from: vi.fn(), getUser: vi.fn(), admin: false, headers: {} as Record<string, string> }));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => ({ inputValidator: () => ({ handler: (fn: unknown) => fn }) }) }));
vi.mock("@tanstack/react-start/server", () => ({ getRequest: () => new Request("http://localhost", { headers: mocks.headers }) }));
vi.mock("@/lib/ai-moderation.server", () => ({ callModerationAI: mocks.ai }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: mocks.from, rpc: mocks.store, auth: { getUser: mocks.getUser } } }));
import { sendMessage } from "@/lib/messages.functions";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.headers = {};
  mocks.admin = false;
  mocks.from.mockImplementation((table: string) => {
    const q = {
      select: () => q, eq: () => q, delete: () => q,
      gte: async () => ({ count: 0 }), lt: async () => ({}),
      maybeSingle: async () => ({ data: table === "profiles" ? { id: "recipient", inbox_paused: false, suspended: false } : table === "user_roles" ? (mocks.admin ? { role: "admin" } : null) : { value: false }, error: null }),
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
  const guest = mocks.store.mock.calls[0]![1];
  expect(guest._sender_user_id).toBeNull();
  expect(guest._sender_network_hash).toMatch(/^[0-9a-f]{64}$/);
  mocks.headers = { authorization: "Bearer tok" };
  mocks.getUser.mockResolvedValue({ data: { user: { id: "sender-1" } } });
  await send({ data: { username: "student", body: "Hi" } });
  const member = mocks.store.mock.calls[1]![1];
  expect(member._sender_user_id).toBe("sender-1");
  expect(member._sender_network_hash).toBeNull();
});
it("a stored message gets a private status link whose hash, not the link, is saved", async () => {
  mocks.ai.mockResolvedValue(JSON.stringify({ verdict: "allow", category: null, reason: "" }));
  mocks.store.mockImplementation(async (fn: string) => (fn === "store_screened_message" ? { data: "message-1", error: null } : { error: null }));
  const res = (await send({ data: { username: "student", body: "Hi" } })) as { ok: boolean; tracker?: string };
  expect(res.ok).toBe(true);
  expect(res.tracker).toMatch(/^[A-Za-z0-9_-]{43}$/);
  const [fn, args] = mocks.store.mock.calls[1]!;
  expect(fn).toBe("attach_message_tracker");
  expect(args._message_id).toBe("message-1");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(res.tracker));
  expect(args._token_hash).toBe(Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join(""));
  expect(args._token_hash).not.toContain(res.tracker);
});
it("a failed status link still reports the message as sent", async () => {
  mocks.ai.mockResolvedValue(JSON.stringify({ verdict: "allow", category: null, reason: "" }));
  mocks.store.mockImplementation(async (fn: string) => (fn === "store_screened_message" ? { data: "message-1", error: null } : { error: { message: "down" } }));
  expect(await send({ data: { username: "student", body: "Hi" } })).toEqual({ ok: true });
});
it("word-filter hits are held for a moderator instead of being rejected", async () => {
  mocks.ai.mockResolvedValue(JSON.stringify({ verdict: "allow", category: "none", reason: "" }));
  expect(await send({ data: { username: "student", body: "you are a retard" } })).toEqual({ ok: true });
  expect(mocks.store).toHaveBeenCalledWith("store_screened_message", expect.objectContaining({ _status: "pending", _source: "ai", _reason: "Word filter: swearing or offensive word." }));
});
it("contact details are still refused before storage", async () => {
  expect(await send({ data: { username: "student", body: "call me +998 90 123 45 67" } })).toEqual({ ok: false, code: "personal" });
  expect(mocks.store).not.toHaveBeenCalled();
});
it("an admin's message skips every check and goes straight to the inbox", async () => {
  mocks.admin = true;
  mocks.headers = { authorization: "Bearer tok" };
  mocks.getUser.mockResolvedValue({ data: { user: { id: "admin-1" } } });
  mocks.store.mockResolvedValue({ data: "message-9", error: null });
  const body = "call me +998 90 123 45 67 you retard";
  expect(await send({ data: { username: "student", body } })).toMatchObject({ ok: true });
  expect(mocks.ai).not.toHaveBeenCalled();
  expect(mocks.store).toHaveBeenCalledWith("store_admin_message", { _recipient_id: "recipient", _body: body, _sender_user_id: "admin-1" });
  expect(mocks.store).not.toHaveBeenCalledWith("store_screened_message", expect.anything());
  expect(mocks.store).toHaveBeenCalledWith("attach_message_tracker", expect.objectContaining({ _message_id: "message-9" }));
});
it("the admin path is only for signed-in admins", async () => {
  const contact = "call me +998 90 123 45 67";
  mocks.admin = true; // even if the roles table said so, a guest has no account to look up
  expect(await send({ data: { username: "student", body: contact } })).toEqual({ ok: false, code: "personal" });
  mocks.admin = false;
  mocks.headers = { authorization: "Bearer tok" };
  mocks.getUser.mockResolvedValue({ data: { user: { id: "sender-1" } } });
  expect(await send({ data: { username: "student", body: contact } })).toEqual({ ok: false, code: "personal" });
  expect(mocks.store).not.toHaveBeenCalled();
});
it("a failure in the admin path is reported, not hidden", async () => {
  mocks.admin = true;
  mocks.headers = { authorization: "Bearer tok" };
  mocks.getUser.mockResolvedValue({ data: { user: { id: "admin-1" } } });
  mocks.store.mockResolvedValue({ data: null, error: { message: "boom" } });
  expect(await send({ data: { username: "student", body: "hi" } })).toEqual({ ok: false, code: "generic" });
});
