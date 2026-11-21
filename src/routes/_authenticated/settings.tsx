import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, KeyRound, LogOut, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { t } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { deleteMyAccount } from "@/lib/account.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { nameErrorText, UsernameField, type UsernameStatus } from "@/components/site/username-field";
import { saveProfileName, type NameResult } from "@/lib/profile-name.functions";
import { PasswordField } from "@/components/site/auth-fields";
import { isValidPassword } from "@/lib/moderation";
import { cn } from "@/lib/utils";
import { LanguageButtons } from "@/components/site/language";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: t.settings.metaTitle }, { name: "description", content: t.settings.metaDesc }, { property: "og:title", content: t.settings.metaTitle }, { property: "og:description", content: t.settings.metaDesc }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: SettingsPage,
});

function Section({ title, children, danger }: { title: string; children: React.ReactNode; danger?: boolean }) {
  return (
    <section className={cn("glass rounded-3xl p-6", danger && "border-destructive/30")}>
      <h2 className={cn("text-sm font-bold uppercase tracking-wider", danger ? "text-destructive" : "text-muted-foreground")}>{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function SettingsPage() {
  const S = t.settings;
  const { user, profile, refresh } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const del = useServerFn(deleteMyAccount);
  const saveName = useServerFn(saveProfileName);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [status, setStatus] = useState<UsernameStatus>("idle");
  const [saving, setSaving] = useState(false);
  const [paused, setPaused] = useState(false);
  const [searchable, setSearchable] = useState(true);
  const [delOpen, setDelOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const onStatus = useCallback((s: UsernameStatus) => setStatus(s), []);

  useEffect(() => {
    if (profile) {
      setUsername(profile.username ?? "");
      setDisplayName(profile.display_name ?? "");
      setPaused(profile.inbox_paused);
      setSearchable(profile.searchable !== false);
    }
  }, [profile]);

  if (!profile || !user) return null;

  const togglePause = async (accepting: boolean) => {
    setPaused(!accepting);
    const { error } = await supabase.from("profiles").update({ inbox_paused: !accepting }).eq("id", user.id);
    if (error) { setPaused(accepting); toast.error(t.common.somethingWrong); } else { toast.success(S.saved); refresh(); }
  };

  const toggleSearchable = async (on: boolean) => {
    setSearchable(on);
    const { error } = await supabase.from("profiles").update({ searchable: on }).eq("id", user.id);
    if (error) { setSearchable(!on); toast.error(t.common.somethingWrong); } else { toast.success(S.saved); refresh(); }
  };

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status !== "ok") return;
    setSaving(true);
    let r: NameResult;
    try {
      r = await saveName({ data: { username, displayName } });
    } catch {
      r = { ok: false, code: "generic" };
    }
    setSaving(false);
    if (!r.ok) toast.error(nameErrorText(r));
    else { toast.success(S.saved); refresh(); }
  };

  const download = async () => {
    const [{ data: p }, { data: msgs }] = await Promise.all([
      supabase.from("profiles").select("email, username, display_name, avatar_url, bio, inbox_paused, searchable, created_at").eq("id", user.id).single(),
      supabase.from("messages").select("body, created_at, read_at").eq("recipient_id", user.id).eq("status", "approved").eq("hidden", false).order("created_at", { ascending: false }),
    ]);
    const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), profile: p, messages: msgs ?? [] }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `wconfa-${profile.username ?? "data"}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidPassword(newPassword)) { toast.error(t.auth.errPassword); return; }
    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPassword(false);
    if (error) toast.error(S.passwordChangeFailed);
    else { toast.success(S.passwordUpdated); setNewPassword(""); setPasswordOpen(false); }
  };

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const deleteAccount = async () => {
    setDeleting(true);
    try {
      await del();
      qc.clear();
      await supabase.auth.signOut();
      toast.success(S.deleted);
      navigate({ to: "/", replace: true });
    } catch {
      setDeleting(false);
      toast.error(t.common.somethingWrong);
    }
  };

  const dirty = username !== (profile.username ?? "") || displayName !== (profile.display_name ?? "");

  return (
    <main className="mx-auto max-w-2xl space-y-4 px-4 pt-4 md:pt-10">
      <div className="flex items-center justify-between gap-3 px-1">
        <h1 className="text-4xl font-extrabold tracking-tight">{S.title}</h1>
        <Button variant="secondary" className="h-11 rounded-full px-4" onClick={signOut}><LogOut /> {t.common.signOut}</Button>
      </div>

      <Section title={S.inboxSection}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="accepting" className="text-base font-semibold">{S.pauseLabel}</Label>
            <p className="mt-1 text-sm text-muted-foreground">{S.pauseHint}</p>
          </div>
          <Switch id="accepting" checked={!paused} onCheckedChange={togglePause} />
        </div>
        <div className="mt-5 flex items-center justify-between gap-4 border-t pt-5">
          <div>
            <Label htmlFor="searchable" className="text-base font-semibold">{S.searchLabel}</Label>
            <p className="mt-1 text-sm text-muted-foreground">{S.searchHint}</p>
          </div>
          <Switch id="searchable" checked={searchable} onCheckedChange={toggleSearchable} />
        </div>
      </Section>

      <Section title={S.profileSection}>
        <form onSubmit={saveProfile} className="space-y-5">
          <UsernameField value={username} onChange={setUsername} onStatus={onStatus} current={profile.username} />
          <div className="space-y-2">
            <Label htmlFor="dn">{S.displayName}</Label>
            <Input id="dn" maxLength={40} className="h-12 rounded-2xl text-base" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <Button type="submit" disabled={!dirty || saving || status !== "ok"}>{t.common.save}</Button>
        </form>
      </Section>

      <Section title={t.common.language}>
        <LanguageButtons />
      </Section>

      <Section title={S.accountSection}>
        <p className="mb-5 break-all text-sm text-muted-foreground">{S.signedInAs(profile.email)}</p>
        {passwordOpen ? (
          <form onSubmit={changePassword} className="mb-5 space-y-3">
            <PasswordField value={newPassword} onChange={setNewPassword} isNew label={S.changePassword} id="settings-password" />
            <div className="flex gap-2">
              <Button type="submit" variant="hero" disabled={savingPassword || !isValidPassword(newPassword)}>{S.savePassword}</Button>
              <Button type="button" variant="ghost" onClick={() => { setPasswordOpen(false); setNewPassword(""); }}>{t.common.cancel}</Button>
            </div>
          </form>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          {!passwordOpen && <Button variant="secondary" onClick={() => setPasswordOpen(true)}><KeyRound /> {S.changePassword}</Button>}
          <Button variant="secondary" onClick={download}><Download /> {S.download}</Button>
        </div>
      </Section>

      <Section title={S.dangerSection} danger>
        <p className="mb-4 text-sm text-muted-foreground">{S.dangerHint}</p>
        <Button variant="ghost" className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setDelOpen(true)}><Trash2 /> {S.deleteAccount}</Button>
      </Section>

      <AlertDialog open={delOpen} onOpenChange={(o) => { setDelOpen(o); if (!o) setConfirmText(""); }}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>{S.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>{S.deleteBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="confirm-del">{S.deleteConfirmLabel}</Label>
            <Input id="confirm-del" className="h-12 rounded-2xl" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-12 rounded-2xl">{t.common.cancel}</AlertDialogCancel>
            <Button variant="destructive" disabled={confirmText !== "DELETE" || deleting} onClick={deleteAccount}>{S.deleteConfirm}</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
