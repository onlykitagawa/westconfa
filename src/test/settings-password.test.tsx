import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { t } from "@/i18n";

const mocks = vi.hoisted(() => ({ update: vi.fn(), success: vi.fn(), error: vi.fn(), navigate: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  useNavigate: () => mocks.navigate,
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => vi.fn() }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ cancelQueries: vi.fn(), clear: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { id: "user-1" },
    profile: { id: "user-1", email: "student@students.wiut.uz", username: "student", display_name: null, inbox_paused: false },
    refresh: vi.fn(),
  }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { updateUser: mocks.update, signOut: vi.fn() }, from: vi.fn() } }));
vi.mock("@/components/site/username-field", () => ({ UsernameField: () => null }));
vi.mock("@/components/site/theme", () => ({ ThemeToggle: () => null }));

import { Route } from "@/routes/_authenticated/settings";
const SettingsPage = Route.options.component as React.ComponentType;

describe("Settings change password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  async function submitNewPassword(password: string) {
    const ui = render(<SettingsPage />);
    fireEvent.change(ui.getByLabelText(t.settings.changePassword), { target: { value: password } });
    fireEvent.submit(ui.getByRole("button", { name: t.settings.savePassword }).closest("form") as HTMLFormElement);
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ password }));
    return ui;
  }

  it("updates the password, confirms, and clears the field", async () => {
    mocks.update.mockResolvedValue({ error: null });
    const ui = await submitNewPassword("new-test-password");
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith(t.settings.passwordUpdated));
    expect((ui.getByLabelText(t.settings.changePassword) as HTMLInputElement).value).toBe("");
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it("shows the friendly failure message when the update fails", async () => {
    mocks.update.mockResolvedValue({ error: new Error("weak or session expired") });
    await submitNewPassword("new-test-password");
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith(t.settings.passwordChangeFailed));
    expect(mocks.success).not.toHaveBeenCalled();
  });
});
