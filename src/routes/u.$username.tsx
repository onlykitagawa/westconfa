import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Check, Lock, Send } from "lucide-react";
import { useState } from "react";
import { t } from "@/i18n";
import { getPublicProfile } from "@/lib/profile.functions";
import { sendMessage } from "@/lib/messages.functions";
import { checkMessage, MAX_MESSAGE_LENGTH } from "@/lib/moderation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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

function SendPage() {
  const { profile } = Route.useLoaderData();
  const { username } = Route.useParams();
  const send = useServerFn(sendMessage);
  const [body, setBody] = useState("");
  const [website, setWebsite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

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
    const local = checkMessage(trimmed);
    if (local) return setError(t.send.errors[local]);
    setSending(true);
    try {
      const res = await send({ data: { username, body: trimmed, website } });
      if (res.ok) {
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
      <div className="glass animate-rise rounded-[28px] p-6 md:p-8">
        <div className="flex items-center gap-4">
          <div className="bg-brand grid size-14 shrink-0 place-items-center rounded-2xl text-2xl font-extrabold text-primary-foreground shadow-glow dark:text-foreground" aria-hidden>
            {initial}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground">{t.send.eyebrow}</p>
            <h1 className="truncate text-2xl font-extrabold tracking-tight">{profile.display_name}</h1>
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
            <div className="mt-8 grid gap-3">
              <Button asChild variant="hero" size="lg"><Link to="/">{t.common.getYourOwn}</Link></Button>
              <Button variant="ghost" onClick={() => setSent(false)}>{t.send.sendAnother}</Button>
            </div>
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
              className="w-full resize-none rounded-3xl border bg-background/60 p-5 text-lg leading-relaxed outline-none transition placeholder:text-muted-foreground focus:border-ring focus:ring-4 focus:ring-ring/20"
            />
            {/* Honeypot: hidden from people and assistive tech */}
            <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
              <label>Website<input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} name="website" /></label>
            </div>
            <div className="mt-2 flex items-start justify-between gap-3 px-1 text-sm">
              <p id="msg-error" role="alert" className="text-destructive">{error}</p>
              <span id="counter" className={cn("shrink-0 tabular-nums text-muted-foreground", remaining < 50 && "text-coral font-semibold")}>
                {body.length}/{MAX_MESSAGE_LENGTH}
              </span>
            </div>
            <Button type="submit" variant="hero" size="lg" className="mt-4 w-full" disabled={sending || !body.trim()}>
              <Send /> {sending ? t.send.sending : t.send.button}
            </Button>
          </form>
        )}

        <p className="mt-6 flex items-center justify-center gap-2 text-center text-sm text-muted-foreground">
          <Lock className="size-4 shrink-0" /> {t.send.note}
        </p>
      </div>
    </main>
  );
}
