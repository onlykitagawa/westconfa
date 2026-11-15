import { beforeEach, expect, it, vi } from "vitest";

type Q = { select: () => Q; eq: () => Q; maybeSingle: () => Promise<{ data: unknown; error: null }> };

const mocks = vi.hoisted(() => ({ ai: vi.fn(), rpc: vi.fn(), admin: false }));
vi.mock("@tanstack/react-start", () => {
  const builder = { middleware: () => builder, inputValidator: () => builder, handler: (fn: unknown) => fn };
  return { createServerFn: () => builder };
});
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/lib/ai-moderation.server", () => ({ callModerationAI: mocks.ai }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
    rpc: mocks.rpc,
    from: () => {
      const q: Q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: mocks.admin ? { role: "admin" } : null, error: null }) };
      return q;
    },
  },
}));
import { updateBio } from "@/lib/profile-bio.functions";

const save = updateBio as unknown as (args: { data: { bio: string }; context: { userId: string } }) => Promise<unknown>;
const ctx = { userId: "user-1" };
const verdict = (v: "allow" | "review" | "block") => JSON.stringify({ verdict: v, category: "none", reason: "" });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.admin = false;
  mocks.ai.mockResolvedValue(verdict("allow"));
  mocks.rpc.mockResolvedValue({ data: null, error: null });
});

it("saves a clean bio, trimmed, for the signed-in user only", async () => {
  expect(await save({ data: { bio: "  Econ student. Coffee first.  " }, context: ctx })).toEqual({ ok: true });
  expect(mocks.rpc).toHaveBeenCalledWith("set_profile_bio", { _user: "user-1", _bio: "Econ student. Coffee first." });
});

it("an empty bio clears it without an AI call", async () => {
  expect(await save({ data: { bio: "   " }, context: ctx })).toEqual({ ok: true });
  expect(mocks.ai).not.toHaveBeenCalled();
  expect(mocks.rpc).toHaveBeenCalledWith("set_profile_bio", { _user: "user-1", _bio: "" });
});

it("contact details are refused", async () => {
  expect(await save({ data: { bio: "text me +998 90 123 45 67" }, context: ctx })).toEqual({ ok: false, code: "personal" });
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it("blocked, held and too-long bios are never saved", async () => {
  mocks.ai.mockResolvedValue(verdict("block"));
  expect(await save({ data: { bio: "hello" }, context: ctx })).toEqual({ ok: false, code: "blocked" });
  mocks.ai.mockResolvedValue(verdict("review"));
  expect(await save({ data: { bio: "hello" }, context: ctx })).toEqual({ ok: false, code: "held" });
  mocks.ai.mockResolvedValue(verdict("allow"));
  expect(await save({ data: { bio: "kill you" }, context: ctx })).toEqual({ ok: false, code: "held" });
  expect(await save({ data: { bio: "x".repeat(161) }, context: ctx })).toEqual({ ok: false, code: "generic" });
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it("a database failure is reported, not hidden", async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
  expect(await save({ data: { bio: "hello" }, context: ctx })).toEqual({ ok: false, code: "generic" });
});

it("an admin's bio is saved as written, without the AI or the word filter", async () => {
  mocks.admin = true;
  expect(await save({ data: { bio: "text me +998 90 123 45 67, idiot" }, context: ctx })).toEqual({ ok: true });
  expect(mocks.ai).not.toHaveBeenCalled();
  expect(mocks.rpc).toHaveBeenCalledWith("set_profile_bio", { _user: "user-1", _bio: "text me +998 90 123 45 67, idiot" });
  expect(await save({ data: { bio: "x".repeat(161) }, context: ctx })).toEqual({ ok: false, code: "generic" });
});
