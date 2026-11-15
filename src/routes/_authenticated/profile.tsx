import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Pencil, Settings as SettingsIcon, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { t } from "@/i18n";
import { useAuth } from "@/lib/auth";
import { BIO_MAX_LENGTH } from "@/lib/moderation";
import { updateBio } from "@/lib/profile-bio.functions";
import { Button } from "@/components/ui/button";
import { AnswerCards } from "@/components/site/answer-cards";
import { ShareDialog } from "@/components/site/share-dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: t.profile.metaTitle }, { name: "description", content: t.profile.metaDesc }, { name: "robots", content: "noindex" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const P = t.profile;
  const { profile, refresh } = useAuth();
  const save = useServerFn(updateBio);
  const [editing, setEditing] = useState(false);
  const [bio, setBio] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const savedBio = profile?.bio ?? "";
  useEffect(() => setBio(savedBio), [savedBio]);

  if (!profile?.username) return null;
  const name = profile.display_name || profile.username;
  const remaining = BIO_MAX_LENGTH - bio.length;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await save({ data: { bio } });
      if (res.ok) {
        toast.success(t.settings.saved);
        refresh();
        setEditing(false);
      } else setError(P.errors[res.code]);
    } catch {
      setError(P.errors.generic);
    } finally {
      setSaving(false);
    }
  };
  const cancel = () => { setBio(savedBio); setError(null); setEditing(false); };

  return (
    <main className="mx-auto max-w-2xl space-y-4 px-4 pt-4 md:pt-10">
      <section className="glass animate-rise rounded-[32px] p-6 md:p-8">
        <div className="flex items-start gap-4">
          <div className="grid size-[72px] shrink-0 place-items-center rounded-full bg-coral text-[30px] font-extrabold text-coral-foreground" aria-hidden="true">
            {name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1 pt-1">
            <h1 className="break-words text-[28px] font-extrabold leading-tight [overflow-wrap:anywhere]">{name}</h1>
            <p className="truncate text-sm text-muted-foreground">@{profile.username}</p>
          </div>
          <Button asChild variant="ghost" className="size-11 shrink-0 rounded-full p-0" aria-label={t.common.settings}>
            <Link to="/settings"><SettingsIcon /></Link>
          </Button>
        </div>

        {editing ? (
          <form onSubmit={submit} noValidate className="mt-5 space-y-2">
            <label htmlFor="bio" className="sr-only">{P.bioLabel}</label>
            <textarea
              id="bio"
              value={bio}
              onChange={(e) => { setBio(e.target.value.slice(0, BIO_MAX_LENGTH)); setError(null); }}
              placeholder={P.bioPlaceholder}
              rows={3}
              maxLength={BIO_MAX_LENGTH}
              autoFocus
              className="min-h-[96px] w-full resize-none rounded-[20px] border border-input bg-field p-4 text-[16px] leading-relaxed outline-none transition placeholder:text-muted-foreground focus:border-ring focus:ring-4 focus:ring-ring/30"
            />
            <div className="flex items-start justify-between gap-3 px-1 text-sm">
              <p role="alert" className="text-destructive">{error}</p>
              <span className={cn("shrink-0 tabular-nums text-muted-foreground", remaining < 20 && "font-semibold text-primary")}>{bio.length}/{BIO_MAX_LENGTH}</span>
            </div>
            <div className="flex gap-2">
              <Button type="submit" variant="hero" disabled={saving || bio.trim() === savedBio.trim()}>{saving ? t.common.loading : t.common.save}</Button>
              <Button type="button" variant="ghost" onClick={cancel}>{t.common.cancel}</Button>
            </div>
          </form>
        ) : (
          <>
            <p className={cn("mt-5 whitespace-pre-wrap break-words text-[16px] leading-snug [overflow-wrap:anywhere]", !savedBio && "text-muted-foreground")}>{savedBio || P.noBio}</p>
            <div className="mt-5 grid gap-2 sm:grid-cols-3">
              <Button type="button" variant="secondary" onClick={() => setEditing(true)}><Pencil /> {P.edit}</Button>
              <Button type="button" variant="hero" onClick={() => setShareOpen(true)}><Share2 /> {P.share}</Button>
              <Button asChild variant="secondary">
                <Link to="/u/$username" params={{ username: profile.username }}><ExternalLink /> {P.viewPublic}</Link>
              </Button>
            </div>
          </>
        )}
      </section>

      <AnswerCards
        username={profile.username}
        isOwner
        canReport={false}
        empty={
          <div className="glass rounded-3xl p-6 text-center">
            <p className="text-muted-foreground">{P.emptyAnswers}</p>
            <Button asChild variant="secondary" className="mt-4"><Link to="/inbox">{P.goInbox}</Link></Button>
          </div>
        }
      />
      <ShareDialog open={shareOpen} onOpenChange={setShareOpen} username={profile.username} />
    </main>
  );
}
