import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { consumeAuthLink, readAuthLink } from "@/lib/auth-link";
import { AuthProvider } from "@/lib/auth";
import { t } from "@/i18n";

const mocks = vi.hoisted(() => ({
  user: null as { id: string; email: string } | null,
  update: vi.fn(), navigate: vi.fn(), signOut: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  useNavigate: () => mocks.navigate,
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  auth: {
    signOut: mocks.signOut,
    setSession: async () => { mocks.user = { id: "recovery-account", email: "student@students.wiut.uz" }; return { error: null }; },
    getUser: async () => ({ data: { user: mocks.user }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    updateUser: mocks.update,
  },
  from: () => ({ select: () => ({ eq: () => ({
    maybeSingle: async () => ({ data: null }),
    then: (resolve: (data: { data: unknown[] }) => void) => resolve({ data: [] }),
  }) }) }),
} }));
vi.mock("@/components/site/auth-fields", () => ({
  PasswordField: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => <input aria-label="new password" value={value} onChange={(e) => onChange(e.target.value)} />,
}));

import { supabase } from "@/integrations/supabase/client";
import { Route } from "@/routes/reset-password";
const ResetPassword = Route.options.component as React.ComponentType;

describe("Recovery link password form", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mocks.user = null;
    mocks.signOut.mockImplementation(async () => { mocks.user = null; return { error: null }; });
    mocks.update.mockResolvedValue({ error: null });
  });
  afterEach(cleanup);

  for (const priorAccount of [null, { id: "old-account", email: "old@students.wiut.uz" }]) {
    it(`enables password recovery ${priorAccount ? "after switching accounts" : "in a fresh browser"}`, async () => {
      mocks.user = priorAccount;
      const params = readAuthLink(new URL("https://westconfa.lovable.app/reset-password#access_token=test-access&refresh_token=test-refresh&type=recovery"));
      if (!params) throw new Error("Missing recovery parameters");
      const result = await consumeAuthLink(params, supabase as SupabaseClient, async () => { localStorage.clear(); });
      expect(result).toEqual({ ok: true, email: "student@students.wiut.uz", userId: "recovery-account", recovery: true });
      const ui = render(<AuthProvider authLink={result}><ResetPassword /></AuthProvider>);
      await waitFor(() => expect(ui.getByRole("button", { name: t.auth.savePassword })).toBeEnabled());
      fireEvent.change(ui.getByLabelText("new password"), { target: { value: "new-test-password" } });
      fireEvent.submit(ui.getByRole("button", { name: t.auth.savePassword }).closest("form") as HTMLFormElement);
      await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ password: "new-test-password" }));
      expect(mocks.user?.id).toBe("recovery-account");
    });
  }
});