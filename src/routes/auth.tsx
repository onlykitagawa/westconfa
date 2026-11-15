import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { t } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { isAllowedEmail, isStaffChatEmail, isValidPassword } from "@/lib/moderation";
import { passwordSignIn } from "@/lib/auth.functions";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CodeField, EmailField, EmailHelp, PasswordField, ResendButton } from "@/components/site/auth-fields";

export const Route = createFileRoute("/auth")({
  // /auth?mode=signup opens straight on "Create account" (used by every "Get my link" button).
  validateSearch: (search: Record<string, unknown>): { mode?: "signup" } => (search.mode === "signup" ? { mode: "signup" } : {}),
  head: () => ({
    meta: [
      { title: t.auth.metaTitle }, { name: "description", content: t.auth.metaDesc },
      { property: "og:title", content: t.auth.metaTitle }, { property: "og:description", content: t.auth.metaDesc },
      { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

type Step = "form" | "verify-signup" | "code-request" | "verify-code" | "forgot" | "reset";
const A = t.auth;

function emailError(raw: string): string | null {
  const e = raw.trim().toLowerCase();
  if (isStaffChatEmail(e)) return A.errWiutChat;
  if (!isAllowedEmail(e)) return A.errDomain;
  return null;
}

function mapAuthError(message: string): string {
  if (/could not be delivered|undeliverable|bounce/i.test(message)) return A.errUndeliverable;
  if (/rate|seconds|too many/i.test(message)) return A.errRate;
  if (/database|wiut|allowed/i.test(message)) return A.errDomain;
  return t.common.somethingWrong;
}

function AuthPage() {
  const navigate = useNavigate();
  const { user, loading, openedAuthLink } = useAuth();
  const { mode } = Route.useSearch();
  const signInFn = useServerFn(passwordSignIn);
  const [tab, setTab] = useState<"signin" | "signup">(mode === "signup" ? "signup" : "signin");
  const [step, setStep] = useState<Step>("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agree, setAgree] = useState(false);
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [unverified, setUnverified] = useState(false);
  const [busy, setBusy] = useState(false);
  const holdRedirect = useRef(false);
  useEffect(() => setTab(mode === "signup" ? "signup" : "signin"), [mode]);

  useEffect(() => {
    if (!loading && user && !openedAuthLink && !holdRedirect.current) navigate({ to: "/inbox", replace: true });
  }, [user, loading, openedAuthLink, navigate]);

  const clean = () => email.trim().toLowerCase();
  const go = (s: Step) => { setErr(null); setCode(""); setUnverified(false); setStep(s); };

  const signUp = async (e: React.FormEvent) => {
    e.preventDefault();
    const em = emailError(email);
    if (em) return setErr(em);
    if (!isValidPassword(password)) return setErr(A.errPassword);
    if (!agree) return setErr(A.errAgree);
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: clean(), password, options: { emailRedirectTo: `${window.location.origin}/auth` },
    });
    if (data.user?.identities?.length === 0) {
      try {
        await supabase.auth.signInWithOtp({
          email: clean(), options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/auth` },
        });
      } catch {
        // Keep the same neutral verification screen even if the fallback fails.
      }
    }
    setBusy(false);
    // "Already registered" is treated like success so we never reveal whether an account exists.
    if (error && !/already|registered|exists/i.test(error.message)) return setErr(mapAuthError(error.message));
    go("verify-signup");
  };

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!clean() || !password) return setErr(A.errInvalid);
    setBusy(true);
    try {
      const res = await signInFn({ data: { email: clean(), password } });
      if (!res.ok) {
        if (res.code === "unverified") {
          try {
            await supabase.auth.resend({ type: "signup", email: clean(), options: { emailRedirectTo: `${window.location.origin}/auth` } });
          } catch {
            // Still let the student use an existing verification email or resend later.
          }
          setBusy(false);
          go("verify-signup");
          setUnverified(true);
          return;
        }
        setBusy(false);
        return setErr(res.code === "locked" ? A.errLocked : res.code === "invalid" ? A.errInvalid : t.common.somethingWrong);
      }
      await supabase.auth.setSession({ access_token: res.access_token, refresh_token: res.refresh_token });
      navigate({ to: "/inbox", replace: true });
    } catch {
      setBusy(false);
      setErr(t.common.somethingWrong);
    }
  };

  const requestCode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const em = emailError(email);
    if (em) return setErr(em);
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: clean(), options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/auth` },
    });
    setBusy(false);
    // Unknown emails fail with "signups not allowed" — stay neutral and show the code screen anyway.
    if (error && /rate|seconds|deliver|bounce/i.test(error.message)) return setErr(mapAuthError(error.message));
    if (step !== "verify-code") go("verify-code");
  };

  const requestReset = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const em = emailError(email);
    if (em) return setErr(em);
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(clean(), { redirectTo: `${window.location.origin}/reset-password` });
    setBusy(false);
    if (error && /rate|seconds|deliver|bounce/i.test(error.message)) return setErr(mapAuthError(error.message));
    if (step !== "reset") go("reset");
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) return setErr(A.errCode);
    setBusy(true);
    setErr(null);
    const type = step === "verify-signup" ? "signup" : "email";
    let { error } = await supabase.auth.verifyOtp({ email: clean(), token: code, type });
    if (error && type === "signup") ({ error } = await supabase.auth.verifyOtp({ email: clean(), token: code, type: "email" }));
    setBusy(false);
    if (error) return setErr(/rate/i.test(error.message) ? A.errRate : A.errCode);
    navigate({ to: "/inbox", replace: true });
  };

  const resetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) return setErr(A.errCode);
    if (!isValidPassword(password)) return setErr(A.errPassword);
    setBusy(true);
    setErr(null);
    holdRedirect.current = true;
    const { error } = await supabase.auth.verifyOtp({ email: clean(), token: code, type: "recovery" });
    if (error) {
      holdRedirect.current = false;
      setBusy(false);
      return setErr(/rate/i.test(error.message) ? A.errRate : A.errCode);
    }
    const { error: upErr } = await supabase.auth.updateUser({ password });
    holdRedirect.current = false;
    setBusy(false);
    if (upErr) return setErr(t.common.somethingWrong);
    toast.success(A.passwordSaved);
    navigate({ to: "/inbox", replace: true });
  };

  const back = (
    <button type="button" onClick={() => { go("form"); setPassword(""); }} className="-ml-2 mb-4 flex min-h-12 items-center gap-1 rounded-xl px-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" /> {step === "forgot" || step === "code-request" ? A.backToSignIn : A.changeEmail}
    </button>
  );
  const errorBox = err && <p role="alert" className="mt-4 rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{err}</p>;

  return (
    <main className="mx-auto max-w-lg px-4 pt-10 md:pt-20">
      <div className="auth-card glass animate-rise rounded-[32px] p-6 sm:p-10 [&_h1]:break-words [&_h1]:text-2xl sm:[&_h1]:text-3xl [&_p]:[overflow-wrap:anywhere]">
        {step === "form" && (
          <>
            <Tabs value={tab} onValueChange={(v) => { setTab(v as "signin" | "signup"); setErr(null); }}>
              <TabsList className="grid h-13 w-full grid-cols-2 rounded-2xl p-1">
                <TabsTrigger value="signin" className="h-11 rounded-xl text-[15px] font-semibold">{A.tabSignIn}</TabsTrigger>
                <TabsTrigger value="signup" className="h-11 rounded-xl text-[15px] font-semibold">{A.tabSignUp}</TabsTrigger>
              </TabsList>
            </Tabs>
            <h1 className="mt-7 text-3xl font-extrabold tracking-tight">{tab === "signin" ? A.signInTitle : A.signUpTitle}</h1>
            <p className="mt-1 text-muted-foreground">{A.subtitle}</p>
            <EmailHelp />

            {tab === "signin" ? (
              <form onSubmit={signIn} noValidate className="mt-7 space-y-5" key="signin">
                <EmailField value={email} onChange={(v) => { setEmail(v); setErr(null); }} />
                <PasswordField value={password} onChange={(v) => { setPassword(v); setErr(null); }} />
                <div className="-mt-2 flex justify-end">
                  <button type="button" onClick={() => go("forgot")} className="min-h-11 rounded-lg px-1 text-sm font-semibold text-primary hover:underline">{A.forgot}</button>
                </div>
                {errorBox}
                <Button type="submit" variant="hero" className="w-full" disabled={busy}>{busy ? A.signingIn : A.signIn}</Button>
                <Button type="button" variant="ghost" className="w-full" onClick={() => go("code-request")}>{A.codeInstead}</Button>
              </form>
            ) : (
              <form onSubmit={signUp} noValidate className="mt-7 space-y-5" key="signup">
                <EmailField value={email} onChange={(v) => { setEmail(v); setErr(null); }} />
                <PasswordField value={password} onChange={(v) => { setPassword(v); setErr(null); }} isNew />
                <div className="flex items-start gap-3">
                  <Checkbox id="agree" checked={agree} onCheckedChange={(v) => { setAgree(v === true); setErr(null); }} className="mt-0.5 size-5 rounded-md" />
                  <Label htmlFor="agree" className="text-sm font-normal leading-relaxed text-muted-foreground">
                    {A.agree1}<Link to="/terms" className="font-semibold text-foreground underline underline-offset-4">{A.terms}</Link>{A.agree2}
                    <Link to="/privacy" className="font-semibold text-foreground underline underline-offset-4">{A.privacy}</Link>.
                  </Label>
                </div>
                {errorBox}
                <Button type="submit" variant="hero" className="w-full" disabled={busy}>{busy ? A.creating : A.createAccount}</Button>
              </form>
            )}
          </>
        )}

        {(step === "verify-signup" || step === "verify-code") && (
          <form onSubmit={verify} noValidate>
            {back}
            <h1 className="text-3xl font-extrabold tracking-tight">{A.codeTitle}</h1>
            {unverified && <p role="status" className="mt-2 text-sm text-muted-foreground">{A.unverifiedNote}</p>}
            <p className="mt-2 text-muted-foreground">{A.verifySubtitle(clean())}</p>
            {step === "verify-signup" && <p className="mt-2 text-sm text-muted-foreground">{A.existingAccountNote}</p>}
            {clean().endsWith("@students.wiut.uz") && (
              <div className="mt-5">
                <Button asChild variant="glass" className="w-full"><a href="https://outlook.office.com/mail/" target="_blank" rel="noopener">{A.openOutlook}</a></Button>
                <p className="mt-2 text-sm text-muted-foreground">{A.junkHint}</p>
              </div>
            )}
            <div className="mt-7 border-t border-border pt-5">
              <p className="mb-4 text-sm text-muted-foreground">{A.codeAlternative}</p>
              <CodeField value={code} onChange={(v) => { setCode(v); setErr(null); }} />
              {errorBox}
              <Button type="submit" variant="hero" className="mt-6 w-full" disabled={busy || code.length !== 6}>{busy ? A.verifying : A.verify}</Button>
            </div>
            <div className="mt-2">
              <ResendButton onResend={async () => {
                if (step === "verify-signup") await supabase.auth.resend({ type: "signup", email: clean(), options: { emailRedirectTo: `${window.location.origin}/auth` } });
                else await requestCode();
                toast.success(A.resent);
              }} />
            </div>
          </form>
        )}

        {step === "code-request" && (
          <form onSubmit={requestCode} noValidate className="space-y-5">
            {back}
            <h1 className="text-3xl font-extrabold tracking-tight">{A.codeInstead}</h1>
            <EmailHelp />
            <EmailField value={email} onChange={(v) => { setEmail(v); setErr(null); }} autoFocus />
            {errorBox}
            <Button type="submit" variant="hero" className="w-full" disabled={busy}>{busy ? A.sending : A.sendCode}</Button>
          </form>
        )}

        {step === "forgot" && (
          <form onSubmit={requestReset} noValidate className="space-y-5">
            {back}
            <h1 className="text-3xl font-extrabold tracking-tight">{A.forgotTitle}</h1>
            <p className="-mt-2 text-muted-foreground">{A.forgotSubtitle}</p>
            <EmailHelp />
            <EmailField value={email} onChange={(v) => { setEmail(v); setErr(null); }} autoFocus />
            {errorBox}
            <Button type="submit" variant="hero" className="w-full" disabled={busy}>{busy ? A.sending : A.sendReset}</Button>
          </form>
        )}

        {step === "reset" && (
          <form onSubmit={resetPassword} noValidate>
            {back}
            <h1 className="text-3xl font-extrabold tracking-tight">{A.codeTitle}</h1>
            <p className="mt-2 text-muted-foreground">{A.resetSubtitle(clean())}</p>
            {clean().endsWith("@students.wiut.uz") && (
              <div className="mt-5">
                <Button asChild variant="glass" className="w-full"><a href="https://outlook.office.com/mail/" target="_blank" rel="noopener">{A.openOutlook}</a></Button>
                <p className="mt-2 text-sm text-muted-foreground">{A.junkHint}</p>
              </div>
            )}
            <div className="mt-7 space-y-5 border-t border-border pt-5">
              <p className="text-sm text-muted-foreground">{A.resetCodeAlternative}</p>
              <CodeField value={code} onChange={(v) => { setCode(v); setErr(null); }} />
              <PasswordField value={password} onChange={(v) => { setPassword(v); setErr(null); }} isNew label={A.newPassword} id="new-password" />
              {errorBox}
              <Button type="submit" variant="hero" className="w-full" disabled={busy || code.length !== 6}>{busy ? A.verifying : A.savePassword}</Button>
            </div>
            <div className="mt-2"><ResendButton onResend={async () => { await requestReset(); toast.success(A.resent); }} /></div>
          </form>
        )}
      </div>
    </main>
  );
}
