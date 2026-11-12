import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ ai: vi.fn(), store: vi.fn(), from: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => ({ inputValidator: () => ({ handler: (fn: unknown) => fn }) }) }));
vi.mock("@tanstack/react-start/server", () => ({ getRequest: () => new Request("http://localhost") }));
vi.mock("@/lib/ai-moderation.server", () => ({ callModerationAI: mocks.ai }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: mocks.from, rpc: mocks.store } }));
import { sendMessage } from "@/lib/messages.functions";
beforeEach(() => {
  vi.clearAllMocks();
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
  expect(mocks.store).toHaveBeenCalledWith("store_screened_message", expect.objectContaining({ _status: "pending", _source: "ai_error", _body: "Hello" }));
});