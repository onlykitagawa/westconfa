import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, ExternalLink, Flag, Lock, Send, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { t } from "@/i18n";
import { getPublicProfile } from "@/lib/profile.functions";
import { sendMessage } from "@/lib/messages.functions";
import { checkMessage, MAX_MESSAGE_LENGTH } from "@/lib/moderation";
import { Button } from "@/components/ui/button";
import { shareOrigin } from "@/components/site/share-dialog";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

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

// The sender's private status link, shown once right after sending. Only its hash is stored.
function TrackLink({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  const link = `${shareOrigin()}/m/${token}`;
  const copy = async () => {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success(t.send.trackCopied);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <div className="mt-8 rounded-[22px] bg-accent p-5 text-left">
      <p className="font-semibold text-accent-foreground">{t.send.trackTitle}</p>
      <p className="mt-1 text-sm text-muted-foreground">{t.send.trackBody}</p>
      <div className="mt-3 truncate rounded-2xl border bg-background/60 px-4 py-3 font-mono text-sm">{link.replace(/^https?:\/\//, "")}</div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button type="button" variant="secondary" onClick={copy}>
          {copied ? <Check /> : <Copy />} {t.send.trackCopy}
        </Button>
        <Button asChild variant="ghost">
          <a href={`/m/${token}`} target="_blank" rel="noopener noreferrer"><ExternalLink /> {t.send.trackOpen}</a>
        </Button>
      </div>
    </div>
  );
}

type Answer = { id: string; question: string; answer: string; created_at: string };

// Messages the owner chose to answer in public. Only the text is shown; nothing links a card to its sender.
function AnswerCards({ username, isOwner, canReport }: { username: string; isOwner: boolean; canReport: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["answers", username],
    staleTime: 30_000,
    queryFn: async (): Promise<Answer[]> => {
      const { data, error } = await supabase.rpc("get_public_answers", { _username: username });
      if (error) throw error;
      return data ?? [];
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["answers", username] });
  const remove = async (id: string) => {
    const { error } = await supabase.from("public_answers").delete().eq("id", id);
    if (error) return toast.error(t.common.somethingWrong);
    toast.success(t.send.qaRemoved);
    refresh();
  };
  const report = async (id: string) => {
    const { error } = await supabase.rpc("report_answer", { _answer_id: id });
    if (error) return toast.error(t.common.somethingWrong);
    toast.success(t.send.qaReported);
  };
  if (!q.data?.length) return null;
  return (
    <section className="mt-6" aria-labelledby="qa-title">
      <h2 id="qa-title" className="px-1 text-sm font-bold uppercase tracking-wider text-muted-foreground">{t.send.qaTitle}</h2>
      <ul className="mt-3 space-y-3">
        {q.data.map((a) => (
          <li key={a.id} className="glass animate-rise rounded-[26px] p-5">
            <p className="text-xs font-semibold text-muted-foreground">{t.send.qaAsked}</p>
            <p className="mt-1 whitespace-pre-wrap break-words rounded-[18px] bg-field px-4 py-3 text-[16px] leading-snug [overflow-wrap:anywhere]">{a.question}</p>
            <p className="mt-3 whitespace-pre-wrap break-words px-1 text-[17px] font-medium leading-snug [overflow-wrap:anywhere]">{a.answer}</p>
            {(isOwner || canReport) && (
              <div className="mt-3 flex justify-end">
                {isOwner ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => remove(a.id)}><Trash2 /> {t.send.qaRemove}</Button>
                ) : (
                  <Button type="button" variant="ghost" size="sm" onClick={() => report(a.id)}><Flag /> {t.send.qaReport}</Button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function SendPage() {
  const { profile } = Route.useLoaderData();
  const { username } = Route.useParams();
  const send = useServerFn(sendMessage);
  const { profile: me, user, loading } = useAuth();
  const [body, setBody] = useState("");
  const [website, setWebsite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [tracker, setTracker] = useState<string | null>(null);

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
    if (checkMessage(trimmed) === "personal") return setError(t.send.errors.personal);
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

  const initial = profile.display_name.charAt(0).toUpperCase();
  const remaining = MAX_MESSAGE_LENGTH - body.length;

  return (
    <main className="mx-auto max-w-lg px-4 pt-6 md:pt-14">
      <div className="glass animate-rise rounded-[32px] p-6 md:p-8">
        <div className="flex items-center gap-4">
          <div className="grid size-[60px] shrink-0 place-items-center rounded-full bg-coral text-[26px] font-extrabold text-coral-foreground" aria-hidden>
            {initial}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground">{t.send.eyebrow}</p>
            <h1 className="break-words text-[28px] font-extrabold [overflow-wrap:anywhere]">{profile.display_name}</h1>
            <p className="truncate text-sm text-muted-foreground">@{profile.username}</p>
          </div>
        </div>

        {sent ? (
          <div className="py-10 text-center" role="status" aria-live="polite">
            <div className="animate-pop mx-auto grid size-20 place-items-center rounded-full bg-success/15 text-success">
              <Check className="size-10" strokeWidth={2.5} />
            </div>
            <h2 className="animate-rise mt-6 text-3xl font-extrabold">{t.send.successTitle}</h2>
            <p className="animate-rise mx-auto mt-2 max-w-xs text-muted-foreground">{t.send.successBody}</p>
            {tracker && <TrackLink token={tracker} />}
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
            <textarea
              id="msg"
              value={body}
              onChange={(e) => { setBody(e.target.value.slice(0, MAX_MESSAGE_LENGTH)); setError(null); }}
              placeholder={t.send.placeholder}
              rows={6}
              maxLength={MAX_MESSAGE_LENGTH}
              aria-describedby="counter msg-error"
              aria-invalid={!!error}
               className="min-h-[220px] w-full resize-none rounded-[22px] border border-input bg-field p-[18px] text-[17px] leading-relaxed outline-none transition placeholder:text-muted-foreground focus:border-ring focus:ring-4 focus:ring-ring/30"
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
            <p className="mt-3 text-center text-xs text-muted-foreground">{t.send.publicNote}</p>
          </form>
        )}

        <p className="mt-6 flex items-center justify-center gap-2 text-center text-sm text-muted-foreground">
          <Lock className="size-4 shrink-0" /> {t.send.note}
        </p>
      </div>
      <AnswerCards username={profile.username} isOwner={me?.username === profile.username} canReport={!!user && me?.username !== profile.username} />
      {!loading && !user && <p className="mt-5 text-center text-sm text-muted-foreground">{t.send.wantOwnLink} <Link to="/auth" className="rounded-sm underline underline-offset-4 hover:text-foreground">{t.send.getYours}</Link></p>}
    </main>
  );
}
