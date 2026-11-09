import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { t } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { isValidPassword } from "@/lib/moderation";
import { Button } from "@/components/ui/button";
import { PasswordField } from "@/components/site/auth-fields";
import { useAuth } from "@/lib/auth";

// Landing page for the password-reset link in the email. The link signs the user in
// with a recovery session; here they choose the new password.
export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: `${t.auth.resetTitle} · west confa` },
      { name: "description", content: t.auth.forgotSubtitle },
      { property: "og:title", content: `${t.auth.resetTitle} · west confa` },
      { property: "og:description", content: t.auth.forgotSubtitle },
      { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const { user, loading, recoveryUserId } = useAuth();
  const ready = !loading && !!recoveryUserId && user?.id === recoveryUserId;
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return setErr(t.auth.errCode);
    if (!isValidPassword(password)) return setErr(t.auth.errPassword);
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setErr(t.common.somethingWrong);
    toast.success(t.auth.passwordSaved);
    navigate({ to: "/inbox", replace: true });
  };

  return (
    <main className="mx-auto max-w-md px-4 pt-6 md:pt-14">
      <div className="glass animate-rise rounded-[28px] p-6 md:p-8">
        <h1 className="text-3xl font-extrabold tracking-tight">{t.auth.resetTitle}</h1>
        {!loading && !ready ? (
          <>
            <p className="mt-3 text-muted-foreground">{t.auth.errCode}</p>
            <Button asChild variant="hero" className="mt-6 w-full"><Link to="/auth">{t.auth.backToSignIn}</Link></Button>
          </>
        ) : (
          <form onSubmit={submit} noValidate className="mt-6 space-y-5">
            <PasswordField value={password} onChange={(v) => { setPassword(v); setErr(null); }} isNew label={t.auth.newPassword} id="new-password" />
            {err && <p role="alert" className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{err}</p>}
            <Button type="submit" variant="hero" className="w-full" disabled={busy || !ready}>{t.auth.savePassword}</Button>
          </form>
        )}
      </div>
    </main>
  );
}
