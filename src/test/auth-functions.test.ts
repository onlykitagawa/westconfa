import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(), insert: vi.fn(), remove: vi.fn(),
  count: vi.fn(), handler: undefined as undefined | ((args: { data: { email: string; password: string } }) => Promise<unknown>),
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({ inputValidator: () => ({ handler: (handler: typeof mocks.handler) => { mocks.handler = handler; return handler; } }) }),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ auth: { signInWithPassword: mocks.signIn } }) }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: () => ({
    select: () => ({ eq: () => ({ gte: mocks.count }) }),
    insert: mocks.insert,
    delete: () => ({ eq: mocks.remove }),
  }) },
}));

import "@/lib/auth.functions";

async function signIn() {
  if (!mocks.handler) throw new Error("Missing sign-in handler");
  return mocks.handler({ data: { email: "student@students.wiut.uz", password: "test-password" } });
}

describe("Password sign-in results", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("SUPABASE_URL", "https://example.invalid");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test-key");
    mocks.count.mockResolvedValue({ count: 0 });
  });

  it("returns unverified without recording a failed password attempt", async () => {
    mocks.signIn.mockResolvedValue({ data: { session: null }, error: { code: "email_not_confirmed", status: 400 } });
    expect(await signIn()).toEqual({ ok: false, code: "unverified" });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("still records invalid credentials as a failed attempt", async () => {
    mocks.signIn.mockResolvedValue({ data: { session: null }, error: { code: "invalid_credentials", status: 400 } });
    expect(await signIn()).toEqual({ ok: false, code: "invalid" });
    expect(mocks.insert).toHaveBeenCalledOnce();
  });

  it("keeps the five-attempt lockout", async () => {
    mocks.count.mockResolvedValue({ count: 5 });
    expect(await signIn()).toEqual({ ok: false, code: "locked" });
    expect(mocks.signIn).not.toHaveBeenCalled();
  });
});