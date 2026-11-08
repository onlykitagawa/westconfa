import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Mail } from "lucide-react";
import { t } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { isAllowedEmail } from "@/lib/moderation";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: t.auth.metaTitle }, { name: "description", content: t.auth.metaDesc },
      { property: "og:title", content: t.auth.metaTitle }, { property: "og:description", content: t.auth.metaDesc },
      { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const A = t.auth;
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [agree, setAgree] = useState(false);
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/inbox", replace: true });
  }, [user, loading, navigate]);

  const sendCode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setErr(null);
    const clean = email.trim().toLowerCase();
    if (!isAllowedEmail(clean)) return setErr(A.errDomain);
    if (!agree) return setErr(A.errAgree);
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: clean,
      options: { shouldCreateUser: true, emailRedirectTo: `${window.location.origin}/inbox` },
    });
    setBusy(false);
    if (error) {
      if (/rate|seconds/i.test(error.message)) return setErr(A.errRate);
      if (/database|wiut|allowed/i.test(error.message)) return setErr(A.errDomain);
      return setErr(t.common.somethingWrong);
    }
    setEmail(clean);
    setStep("code");
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: "email" });
    setBusy(false);
    if (error) return setErr(/rate/i.test(error.message) ? A.errRate : A.errCode);
    navigate({ to: "/inbox", replace: true });
  };

  return (
    <main className="mx-auto max-w-md px-5 pt-8 md:pt-16">
      <div className="glass animate-rise rounded-[28px] p-6 md:p-8">
        {step === "email" ? (
          <form onSubmit={sendCode} noValidate>
            <h1 className="text-3xl font-extrabold tracking-tight">{A.title}</h1>
            <p className="mt-2 text-muted-foreground">{A.subtitle}</p>
            <div className="mt-8 space-y-2">
              <Label htmlFor="email">{A.email}</Label>
              <Input
                id="email" type="email" inputMode="email" autoComplete="email" autoFocus
                className="h-12 rounded-2xl text-base" placeholder={A.emailPlaceholder}
                value={email} onChange={(e) => { setEmail(e.target.value); setErr(null); }}
              />
            </div>
            <div className="mt-5 flex items-start gap-3">
              <Checkbox id="agree" checked={agree} onCheckedChange={(v) => { setAgree(v === true); setErr(null); }} className="mt-0.5 size-5 rounded-md" />
              <Label htmlFor="agree" className="text-sm font-normal leading-relaxed text-muted-foreground">
                {A.agree1}<Link to="/terms" className="font-semibold text-foreground underline underline-offset-4">{A.terms}</Link>{A.agree2}
                <Link to="/privacy" className="font-semibold text-foreground underline underline-offset-4">{A.privacy}</Link>.
              </Label>
            </div>
            {err && <p role="alert" className="mt-4 rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{err}</p>}
            <Button type="submit" variant="hero" className="mt-6 w-full" disabled={busy}>
              <Mail /> {busy ? A.sending : A.sendCode}
            </Button>
          </form>
        ) : (
          <form onSubmit={verify} noValidate>
            <button type="button" onClick={() => { setStep("email"); setCode(""); setErr(null); }} className="-ml-2 mb-4 flex min-h-12 items-center gap-1 rounded-xl px-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
              <ArrowLeft className="size-4" /> {A.changeEmail}
            </button>
            <h1 className="text-3xl font-extrabold tracking-tight">{A.codeTitle}</h1>
            <p className="mt-2 text-muted-foreground">{A.codeSubtitle(email)}</p>
            <div className="mt-8 space-y-2">
              <Label htmlFor="code">{A.code}</Label>
              <Input
                id="code" inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={8}
                className="h-14 rounded-2xl text-center font-mono text-2xl tracking-[0.4em]"
                value={code} onChange={(e) => { setCode(e.target.value.replace(/\D/g, "")); setErr(null); }}
              />
            </div>
            {err && <p role="alert" className="mt-4 rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{err}</p>}
            <Button type="submit" variant="hero" className="mt-6 w-full" disabled={busy || code.length < 6}>
              {busy ? A.verifying : A.verify}
            </Button>
            <Button type="button" variant="ghost" className="mt-2 w-full" onClick={() => sendCode()} disabled={busy}>{A.resend}</Button>
          </form>
        )}
      </div>
    </main>
  );
}
