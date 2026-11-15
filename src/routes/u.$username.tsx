import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, ExternalLink, Flag, Lock, Send, Share2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { t } from "@/i18n";
import { reportAvatar } from "@/lib/avatar.functions";
import { getPublicProfile } from "@/lib/profile.functions";
import { UserAvatar } from "@/components/site/avatar";
import { sendMessage } from "@/lib/messages.functions";
import { checkMessage, MAX_MESSAGE_LENGTH } from "@/lib/moderation";
import { Button } from "@/components/ui/button";
import { shareOrigin } from "@/components/site/share-dialog";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { AnswerCards } from "@/components/site/answer-cards";

export const Route = createFileRoute("/u/$username")({
  loader: async ({ params }) => ({ profile: await getPublicProfile({ data: { username: params.username } }) }),
  head: ({ loaderData }) => {
    const name = loaderData?.profile?.display_name ?? "a WIUT student";
    const title = t.send.metaTitle(name);
    const desc = t.send.metaDesc(name);
    return {
      meta: [
        { title }, { name: "description", content: desc },
        { property: "og:title", content: title }, { property: "og:description", content: desc },
        { property: "og:type", content: "profile" }, { name: "twitter:card", content: "summary_large_image" },
        ...(loaderData?.profile ? [] : [{ name: "robots", content: "noindex" }]),
      ],
    };
  },
  component: SendPage,
});

// What the sender sees after sending. Signed-in students: the message is saved on their Sent page,
// no link needed. Guests: the private status link is the ONLY way back (only its hash is stored), so
// it is shown prominently and the browser warns before leaving until it has been copied or shared.
function TrackLink({ token, signedIn }: { token: string; signedIn: boolean }) {
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(signedIn);
  const link = `${shareOrigin()}/m/${token}`;
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  useEffect(() => {
    if (saved) return;
    const guard = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [saved]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setSaved(true);
      toast.success(t.send.trackCopied);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error(t.common.somethingWrong);
    }
  };
  const share = async () => {
    try {
      await navigator.share({ url: link, title: t.send.trackTitle });
      setSaved(true);
    } catch {
      // cancelled: nothing to do
    }
  };

  if (signedIn)
    return (
      <div className="mt-8 rounded-[22px] bg-accent p-5 text-left">
        <p className="font-semibold text-accent-foreground">{t.send.trackSavedTitle}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t.send.trackSavedBody}</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button asChild variant="secondary"><Link to="/sent">{t.send.trackSavedCta}</Link></Button>
          <Button type="button" variant="ghost" onClick={copy}>{copied ? <Check /> : <Copy />} {t.send.trackCopyAnyway}</Button>
        </div>
      </div>
    );

  return (
    <div className="mt-8 rounded-[22px] border-2 border-primary/40 bg-accent p-5 text-left" role="alert">
      <p className="text-lg font-bold text-accent-foreground">{t.send.trackTitle}</p>
      <p className="mt-1 text-sm text-muted-foreground">{t.send.trackBody}</p>
      <div className="mt-3 truncate rounded-2xl border bg-background/60 px-4 py-3 font-mono text-sm">{link.replace(/^https?:\/\//, "")}</div>
      <div className={cn("mt-3 grid gap-2", canShare ? "grid-cols-2" : "grid-cols-1")}>
        <Button type="button" variant="hero" onClick={copy}>
          {copied ? <Check /> : <Copy />} {t.send.trackCopy}
        </Button>
        {canShare && (
          <Button type="button" variant="secondary" onClick={share}>
            <Share2 /> {t.send.trackShare}
          </Button>
        )}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{t.send.trackTip}</p>
      <Button asChild variant="ghost" className="mt-1 w-full">
        <a href={`/m/${token}`} target="_blank" rel="noopener noreferrer"><ExternalLink /> {t.send.trackOpen}</a>
      </Button>
    </div>
  );
}

function SendPage() {
  const { profile } = Route.useLoaderData();
  const { username } = Route.useParams();
  const send = useServerFn(sendMessage);
  const reportAvatarFn = useServerFn(reportAvatar);
  const { profile: me, user, loading, isAdmin } = useAuth();
  const [body, setBody] = useState("");
  const [website, setWebsite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [tracker, setTracker] = useState<string | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const applyIdea = (text: string) => {
    setBody(text);
    setError(null);
    requestAnimationFrame(() => {
      const el = box.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(text.length, text.length);
    });
  };

  if (!profile) {
    return (
      <main className="mx-auto max-w-md px-5 pt-16 text-center">
        <h1 className="text-3xl font-extrabold">{t.send.notFoundTitle}</h1>
        <p className="mt-3 text-muted-foreground">{t.send.notFoundBody}</p>
        <Button asChild variant="hero" className="mt-8"><Link to="/">{t.common.getYourOwn}</Link></Button>
      </main>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = body.trim();
    if (!trimmed) return setError(t.send.errors.empty);
    if (!isAdmin && checkMessage(trimmed) === "personal") return setError(t.send.errors.personal);
    setSending(true);
    try {
      const res = await send({ data: { username, body: trimmed, website } });
      if (res.ok) {
        setTracker(res.tracker ?? null);
        setSent(true);
        setBody("");
      } else setError(t.send.errors[res.code]);
    } catch {
      setError(t.send.errors.generic);
    } finally {
      setSending(false);
    }
  };

  const reportPhoto = async () => {
    try {
      const res = await reportAvatarFn({ data: { username: profile.username } });
      if (res.ok) toast.success(t.avatar.reported);
      else toast.error(t.avatar.errors[res.code]);
    } catch {
      toast.error(t.avatar.errors.generic);
    }
  };
  const remaining = MAX_MESSAGE_LENGTH - body.length;

  return (
    <main className="mx-auto max-w-lg px-4 pt-6 md:pt-14">
      <div className="glass animate-rise rounded-[32px] p-6 md:p-8">
        <div className="flex items-center gap-4">
          <UserAvatar url={profile.avatar_url} name={profile.display_name} className="size-[60px] text-[26px]" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground">{t.send.eyebrow}</p>
            <h1 className="break-words text-[28px] font-extrabold [overflow-wrap:anywhere]">{profile.display_name}</h1>
            <p className="truncate text-sm text-muted-foreground">@{profile.username}</p>
          </div>
        </div>
        {profile.bio && <p className="mt-4 whitespace-pre-wrap break-words text-[16px] leading-snug [overflow-wrap:anywhere]">{profile.bio}</p>}
        {profile.avatar_url && !!user && me?.username !== profile.username && (
          <button type="button" onClick={reportPhoto} className="mt-3 inline-flex items-center gap-1.5 rounded-sm text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            <Flag className="size-3.5" aria-hidden="true" /> {t.avatar.report}
          </button>
        )}

        {sent ? (
          <div className="py-10 text-center" role="status" aria-live="polite">
            <div className="animate-pop mx-auto grid size-20 place-items-center rounded-full bg-success/15 text-success">
              <Check className="size-10" strokeWidth={2.5} />
            </div>
            <h2 className="animate-rise mt-6 text-3xl font-extrabold">{t.send.successTitle}</h2>
            <p className="animate-rise mx-auto mt-2 max-w-xs text-muted-foreground">{t.send.successBody}</p>
            {tracker && <TrackLink token={tracker} signedIn={!!user} />}
            <div className="mt-8 grid gap-3">
              <Button asChild variant="hero" size="lg" className="w-full px-4"><Link to="/">{t.common.getYourOwn}</Link></Button>
              <Button variant="ghost" onClick={() => { setSent(false); setTracker(null); }}>{t.send.sendAnother}</Button>
            </div>
          </div>
        ) : me?.username === profile.username ? (
          <div className="mt-8 rounded-2xl bg-accent p-5 text-center">
            <p className="font-semibold text-accent-foreground">{t.send.ownLink}</p>
            <Button asChild variant="hero" className="mt-4"><Link to="/inbox">{t.common.inbox}</Link></Button>
          </div>
        ) : !profile.accepting ? (
          <p className="mt-8 rounded-2xl bg-muted p-5 text-center text-muted-foreground">{t.send.paused}</p>
        ) : (
          <form onSubmit={submit} className="mt-6" noValidate>
            <label htmlFor="msg" className="sr-only">{t.send.label}</label>
            {!body && (
              <div className="mb-3">
                <p className="mb-2 px-1 text-xs font-semibold text-muted-foreground">{t.send.ideasLabel}</p>
                <div className="flex flex-wrap gap-2">
                  {t.send.ideas.map((idea) => (
                    <button key={idea.label} type="button" onClick={() => applyIdea(idea.text)} className="press rounded-full border bg-field px-3.5 py-2 text-sm font-semibold hover:bg-accent">
                      {idea.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <textarea
              ref={box}
              id="msg"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
              value={body}
              onChange={(e) => { setBody(e.target.value.slice(0, MAX_MESSAGE_LENGTH)); setError(null); }}
              placeholder={t.send.placeholder}
              rows={4}
              maxLength={MAX_MESSAGE_LENGTH}
              aria-describedby="counter msg-error"
              aria-invalid={!!error}
              className="max-h-[45dvh] min-h-[136px] w-full [field-sizing:content] md:min-h-[180px] resize-none rounded-[22px] border border-input bg-field p-[18px] text-[17px] leading-relaxed outline-none transition placeholder:text-muted-foreground focus:border-ring focus:ring-4 focus:ring-ring/30"
            />
            {/* Honeypot: hidden from people and assistive tech */}
            <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
              <label>Leave empty<input type="text" tabIndex={-1} autoComplete="new-password" data-1p-ignore data-lpignore="true" value={website} onChange={(e) => setWebsite(e.target.value)} name="hp_confirm_field" /></label>
            </div>
            <div className="mt-2 flex items-start justify-between gap-3 px-1 text-sm">
              <p id="msg-error" role="alert" className="text-destructive">{error}</p>
                <span id="counter" className={cn("shrink-0 tabular-nums text-muted-foreground", remaining < 50 && "text-primary font-semibold")}>
                {body.length}/{MAX_MESSAGE_LENGTH}
              </span>
            </div>
            <Button type="submit" variant="hero" size="lg" className="mt-4 w-full" disabled={sending || !body.trim()}>
              <Send /> {sending ? t.send.sending : t.send.button}
            </Button>
            <p className="mt-3 flex items-start justify-center gap-2 text-center text-xs leading-relaxed text-muted-foreground">
              <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" /> <span>{t.send.oneNote} <span className="hidden md:inline">· {t.send.shortcut}</span></span>
            </p>
          </form>
        )}
      </div>
      <AnswerCards username={profile.username} isOwner={me?.username === profile.username} canReport={!!user && me?.username !== profile.username} />
      {!loading && !user && <p className="mt-5 text-center text-sm text-muted-foreground">{t.send.wantOwnLink} <Link to="/auth" search={{ mode: "signup" }} className="rounded-sm underline underline-offset-4 hover:text-foreground">{t.send.getYours}</Link></p>}
    </main>
  );
}
