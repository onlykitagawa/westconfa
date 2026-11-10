import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { consumeAuthLink, readAuthLink } from "@/lib/auth-link";

function setup() {
  let user = { id: "old-account", email: "old@students.wiut.uz" };
  const order: string[] = [];
  const auth = {
    signOut: vi.fn(async () => { order.push("signOut"); return { error: null }; }),
    setSession: vi.fn(async () => { order.push("setSession"); user = { id: "link-account", email: "link@students.wiut.uz" }; return { error: null }; }),
    verifyOtp: vi.fn(async () => { user = { id: "link-account", email: "link@students.wiut.uz" }; return { data: { session: { user } }, error: null }; }),
    exchangeCodeForSession: vi.fn(async () => ({ data: { session: { user: { id: "link-account", email: "link@students.wiut.uz" } }, redirectType: "recovery" }, error: null })),
    getUser: vi.fn(async () => ({ data: { user }, error: null })),
  };
  const client = { auth } as unknown as SupabaseClient;
  const clear = vi.fn(async () => { order.push("clear"); });
  return { auth, client, clear, order };
}

describe("Email link account switching", () => {
  it("leaves ordinary /auth visits without link intent", () => {
    expect(readAuthLink(new URL("https://westconfa.lovable.app/auth"))).toBeNull();
  });

  for (const type of ["magiclink", "signup", "recovery"]) {
    it(`replaces the old account with the ${type} link account after clearing private data`, async () => {
      const { client, clear, order, auth } = setup();
      const params = new URLSearchParams({ access_token: "test-access", refresh_token: "test-refresh", type });
      const result = await consumeAuthLink(params, client, clear);
      expect(order).toEqual(["clear", "signOut", "setSession"]);
      expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
      expect(result).toEqual({ ok: true, email: "link@students.wiut.uz", userId: "link-account", recovery: type === "recovery" });
    });
  }

  it("verifies token-hash signup links rather than keeping the stored account", async () => {
    const { client, clear, auth } = setup();
    const params = readAuthLink(new URL("https://westconfa.lovable.app/auth?token_hash=test-hash&type=signup"));
    expect(params).not.toBeNull();
    if (!params) throw new Error("Expected link parameters");
    const result = await consumeAuthLink(params, client, clear);
    expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: "test-hash", type: "signup" });
    expect(result.userId).toBe("link-account");
  });

  it("does not authorize password reset on the old account when the link is expired", async () => {
    const { client, clear, auth } = setup();
    const result = await consumeAuthLink(new URLSearchParams({ error: "access_denied", error_code: "otp_expired", type: "recovery" }), client, clear);
    expect(result).toEqual({ ok: false, recovery: true });
    expect(auth.signOut).toHaveBeenCalledOnce();
    expect(auth.setSession).not.toHaveBeenCalled();
    expect(auth.getUser).not.toHaveBeenCalled();
  });

  it("preserves the PKCE verifier until exchange replaces the old session", async () => {
    const { client, clear, auth } = setup();
    const result = await consumeAuthLink(new URLSearchParams({ code: "test-code" }), client, clear);
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith("test-code");
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, email: "link@students.wiut.uz", userId: "link-account", recovery: true });
  });

  for (const type of ["signup", "magiclink", "recovery"]) {
    it(`accepts an implicit ${type} link in a fresh browser without a PKCE verifier`, async () => {
      const { client, clear, auth } = setup();
      auth.getUser.mockResolvedValue({ data: { user: { id: "link-account", email: "link@students.wiut.uz" } }, error: null });
      const params = readAuthLink(new URL(`https://westconfa.lovable.app/auth#access_token=test-access&refresh_token=test-refresh&type=${type}`));
      if (!params) throw new Error("Missing implicit link");
      const result = await consumeAuthLink(params, client, clear);
      expect(result).toEqual({ ok: true, email: "link@students.wiut.uz", userId: "link-account", recovery: type === "recovery" });
      expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
      expect(auth.setSession).toHaveBeenCalledWith({ access_token: "test-access", refresh_token: "test-refresh" });
    });
  }
});