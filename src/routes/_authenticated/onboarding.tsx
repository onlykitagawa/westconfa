import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { t } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UsernameField, type UsernameStatus } from "@/components/site/username-field";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({ meta: [{ title: t.onboarding.metaTitle }, { name: "robots", content: "noindex" }] }),
  component: Onboarding,
});

function Onboarding() {
  const { user, profile, refresh } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [status, setStatus] = useState<UsernameStatus>("idle");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const onStatus = useCallback((s: UsernameStatus) => setStatus(s), []);

  useEffect(() => {
    if (profile?.username) navigate({ to: "/inbox", replace: true });
  }, [profile, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status !== "ok" || !user) return;
    setBusy(true);
    setErr(null);
    const { error } = await supabase.from("profiles").update({ username, display_name: displayName.trim() || null }).eq("id", user.id);
    if (error) {
      setBusy(false);
      return setErr(error.code === "23505" ? t.onboarding.taken : t.common.somethingWrong);
    }
    await refresh();
    navigate({ to: "/inbox", replace: true });
  };

  return (
    <main className="mx-auto max-w-md px-5 pt-8 md:pt-16">
      <form onSubmit={submit} className="glass animate-rise rounded-[28px] p-6 md:p-8">
        <h1 className="text-3xl font-extrabold tracking-tight">{t.onboarding.title}</h1>
        <p className="mt-2 text-muted-foreground">{t.onboarding.subtitle}</p>
        <div className="mt-8 space-y-6">
          <UsernameField value={username} onChange={setUsername} onStatus={onStatus} />
          <div className="space-y-2">
            <Label htmlFor="dn">{t.onboarding.displayName}</Label>
            <Input id="dn" maxLength={40} className="h-12 rounded-2xl text-base" placeholder={t.onboarding.displayNamePlaceholder} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <div className="rounded-2xl bg-muted px-4 py-3 text-sm">
            <span className="text-muted-foreground">{t.onboarding.preview}: </span>
            <span className="font-mono font-semibold">/u/{username || "you"}</span>
          </div>
        </div>
        {err && <p role="alert" className="mt-4 text-sm text-destructive">{err}</p>}
        <Button type="submit" variant="hero" className="mt-6 w-full" disabled={busy || status !== "ok"}>{t.onboarding.continue}</Button>
      </form>
    </main>
  );
}
