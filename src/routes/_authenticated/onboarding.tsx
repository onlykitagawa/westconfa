import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Camera } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { t } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UsernameField, type UsernameStatus } from "@/components/site/username-field";
import { LinkPanel } from "@/components/site/share-dialog";
import { AvatarEditor } from "@/components/site/avatar-editor";
import { UserAvatar } from "@/components/site/avatar";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({ meta: [{ title: t.onboarding.metaTitle }, { name: "description", content: t.onboarding.metaDesc }, { property: "og:title", content: t.onboarding.metaTitle }, { property: "og:description", content: t.onboarding.metaDesc }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
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
  // After the username is saved we stay here and show the new link instead of an empty inbox.
  const [ready, setReady] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const onStatus = useCallback((s: UsernameStatus) => setStatus(s), []);

  useEffect(() => {
    if (profile?.username && !ready) navigate({ to: "/inbox", replace: true });
  }, [profile, navigate, ready]);

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
    setReady(true);
    await refresh();
    setBusy(false);
  };

  if (ready && profile?.username) {
    const O = t.onboarding;
    return (
      <main className="mx-auto max-w-md px-5 pt-8 md:pt-16">
        <div className="glass animate-rise rounded-[28px] p-6 md:p-8">
          <h1 className="text-3xl font-extrabold tracking-tight">{O.readyTitle}</h1>
          <p className="mt-2 text-muted-foreground">{O.readyBody}</p>
          <div className="mt-6">
            <LinkPanel username={profile.username} />
          </div>
          <div className="mt-6 flex items-center gap-3 border-t pt-5">
            <UserAvatar url={profile.avatar_url} name={profile.display_name || profile.username} className="size-12 text-xl" />
            <Button type="button" variant="ghost" className="flex-1 justify-start" onClick={() => setPhotoOpen(true)}>
              <Camera /> {profile.avatar_url ? O.readyPhotoDone : O.readyPhoto}
            </Button>
          </div>
          <Button asChild variant="hero" className="mt-5 w-full"><Link to="/inbox" replace>{O.readyInbox}</Link></Button>
        </div>
        <AvatarEditor open={photoOpen} onOpenChange={setPhotoOpen} onDone={() => { void refresh(); }} />
      </main>
    );
  }

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
