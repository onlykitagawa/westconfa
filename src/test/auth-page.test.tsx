import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { t } from "@/i18n";

const mocks = vi.hoisted(() => ({ signUp: vi.fn(), otp: vi.fn(), resend: vi.fn(), verify: vi.fn(), signIn: vi.fn(), navigate: vi.fn(), reset: vi.fn(), update: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  useNavigate: () => mocks.navigate,
  useSearch: () => ({}),
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => mocks.signIn }));
vi.mock("@/lib/auth.functions", () => ({ passwordSignIn: vi.fn() }));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: null, loading: false, openedAuthLink: false }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: {
  signUp: mocks.signUp, signInWithOtp: mocks.otp, resend: mocks.resend, verifyOtp: mocks.verify,
  resetPasswordForEmail: mocks.reset, updateUser: mocks.update,
} } }));
vi.mock("@/components/site/auth-fields", () => ({
  EmailField: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => <input aria-label="email" value={value} onChange={(e) => onChange(e.target.value)} />,
  PasswordField: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => <input aria-label="password" value={value} onChange={(e) => onChange(e.target.value)} />,
  CodeField: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => <input aria-label="code" value={value} onChange={(e) => onChange(e.target.value)} />,
  ResendButton: () => null,
  EmailHelp: () => null,
  codeReady: (code: string) => code.length >= 6 && code.length <= 10,
}));

import { Route } from "@/routes/auth";
const AuthPage = Route.options.component as React.ComponentType;
const email = "student@students.wiut.uz";

describe("Sign-in verification transitions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
    mocks.otp.mockResolvedValue({ error: null });
    mocks.resend.mockResolvedValue({ error: null });
    mocks.verify.mockResolvedValue({ error: null });
    mocks.reset.mockResolvedValue({ error: null });
    mocks.update.mockResolvedValue({ error: null });
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  async function signup(identities: unknown[]) {
    mocks.signUp.mockResolvedValue({ data: { user: { identities } }, error: null });
    const ui = render(<AuthPage />);
    fireEvent.mouseDown(ui.getByRole("tab", { name: t.auth.tabSignUp }), { button: 0, ctrlKey: false });
    fireEvent.change(ui.getByLabelText("email"), { target: { value: email } });
    fireEvent.change(ui.getByLabelText("password"), { target: { value: "test-password" } });
    fireEvent.click(ui.getByRole("checkbox"));
    fireEvent.submit(ui.getByRole("button", { name: t.auth.createAccount }).closest("form") as HTMLFormElement);
    await waitFor(() => expect(mocks.signUp).toHaveBeenCalledOnce());
    return ui;
  }

  it("requests a sign-in email when signup returns empty identities", async () => {
    const ui = await signup([]);
    await waitFor(() => expect(mocks.otp).toHaveBeenCalledWith({ email, options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/auth` } }));
    await waitFor(() => expect(ui.getByLabelText("code")).toBeDefined());
    fireEvent.change(ui.getByLabelText("code"), { target: { value: "12345678" } });
    fireEvent.submit(ui.getByRole("button", { name: t.auth.verify }).closest("form") as HTMLFormElement);
    await waitFor(() => expect(mocks.verify).toHaveBeenCalledWith({ email, token: "12345678", type: "signup" }));
  });

  it("does not request a second email for a new signup", async () => {
    const ui = await signup([{ id: "new-identity" }]);
    await waitFor(() => expect(ui.getByLabelText("code")).toBeDefined());
    expect(mocks.otp).not.toHaveBeenCalled();
  });

  it("keeps verification available if the existing-account email request rejects", async () => {
    mocks.otp.mockRejectedValue(new Error("Email unavailable"));
    const ui = await signup([]);
    await waitFor(() => expect(ui.getByLabelText("code")).toBeDefined());
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("resends signup verification after an unverified password result", async () => {
    mocks.signIn.mockResolvedValue({ ok: false, code: "unverified" });
    const ui = render(<AuthPage />);
    fireEvent.change(ui.getByLabelText("email"), { target: { value: email } });
    fireEvent.change(ui.getByLabelText("password"), { target: { value: "test-password" } });
    fireEvent.submit(ui.getByRole("button", { name: t.auth.signIn }).closest("form") as HTMLFormElement);
    await waitFor(() => expect(mocks.resend).toHaveBeenCalledWith({ type: "signup", email, options: { emailRedirectTo: `${window.location.origin}/auth` } }));
    await waitFor(() => expect(ui.getByLabelText("code")).toBeDefined());
    fireEvent.change(ui.getByLabelText("code"), { target: { value: "654321" } });
    fireEvent.submit(ui.getByRole("button", { name: t.auth.verify }).closest("form") as HTMLFormElement);
    await waitFor(() => expect(mocks.verify).toHaveBeenCalledWith({ email, token: "654321", type: "signup" }));
  });

  it("requests a reset link and preserves code-based password recovery on the reset step", async () => {
    const ui = render(<AuthPage />);
    fireEvent.click(ui.getByRole("button", { name: t.auth.forgot }));
    fireEvent.change(ui.getByLabelText("email"), { target: { value: email } });
    fireEvent.submit(ui.getByRole("button", { name: t.auth.sendReset }).closest("form") as HTMLFormElement);
    await waitFor(() => expect(mocks.reset).toHaveBeenCalledWith(email, { redirectTo: `${window.location.origin}/reset-password` }));
    await waitFor(() => expect(ui.getByLabelText("code")).toBeDefined());
    fireEvent.change(ui.getByLabelText("code"), { target: { value: "12345678" } });
    fireEvent.change(ui.getByLabelText("password"), { target: { value: "new-test-password" } });
    fireEvent.submit(ui.getByRole("button", { name: t.auth.savePassword }).closest("form") as HTMLFormElement);
    await waitFor(() => expect(mocks.verify).toHaveBeenCalledWith({ email, token: "12345678", type: "recovery" }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ password: "new-test-password" }));
    expect(mocks.navigate).toHaveBeenCalledWith({ to: "/", replace: true });
  });
});
describe("Email code box", () => {
  it("accepts 6 to 10 digits, whatever length the email uses", async () => {
    const real = await vi.importActual<typeof import("@/components/site/auth-fields")>("@/components/site/auth-fields");
    expect(real.codeReady("12345")).toBe(false);
    expect(real.codeReady("123456")).toBe(true);
    expect(real.codeReady("12345678")).toBe(true);
    expect(real.codeReady("12345678901")).toBe(false);
  });
});
