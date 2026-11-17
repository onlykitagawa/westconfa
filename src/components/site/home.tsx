import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowBigUp, Camera, Check, Copy, Inbox, Link2, MessageCircle, MessagesSquare, PenLine, Plus, QrCode, Search, Send, Share2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { t, timeAgo } from "@/i18n";
import { useAuth } from "@/lib/auth";
import { useBadges, useInboxMessages, type InboxMsg } from "@/lib/inbox-data";
import { askTopQuery } from "@/lib/ask-data";
import { live, LIVE_MS } from "@/lib/live";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { CountBadge, MobileNav } from "./chrome";
import { linkWasShared, ShareDialog, shortLink, useCopyShare, useProfileLink } from "./share-dialog";

// The signed-in home page. One strong element (the newest anonymous message, shown as a big
// speech bubble) and quiet, useful navigation around it, with the top questions from Ask below.
function dayPart(): "morning" | "afternoon" | "evening" {
  const h = new Date().getHours();
  return h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
}

export function Home() {
  const H = t.home;
  const { profile } = useAuth();
  const inbox = useInboxMessages(LIVE_MS);
  const badges = useBadges();
  const [shareOpen, setShareOpen] = useState(false);
  const [part, setPart] = useState<"morning" | "afternoon" | "evening">("evening");
  useEffect(() => setPart(dayPart()), []);
  if (!profile?.username) return null;
  const name = (profile.display_name || profile.username).split(" ")[0] ?? profile.username;
  const messages = inbox.data ?? [];
  const unread = messages.filter((m) => !m.read_at).length;

  return (
    <main className="mx-auto max-w-6xl px-4 pb-6 pt-6 md:px-6 md:pt-12">
      <header className="px-1">
        <h1 className="text-[2rem] font-extrabold leading-tight tracking-tight md:text-5xl">{H.greeting(part, name)}</h1>
        <p className="mt-2 text-base text-muted-foreground md:text-lg" aria-live="polite">
          {inbox.isLoading ? " " : H.summary(unread, badges.sent)}
        </p>
      </header>

      {/* Phone: status, messages, link, checklist, search. Laptop: messages and search on the left,
          status, link and checklist on the right. */}
      <div className="mt-8 grid gap-6 md:mt-10 md:grid-cols-12 md:items-start md:gap-x-8 md:gap-y-6">
        <div className="md:col-span-5 md:col-start-8 md:row-start-1">
          <StatusTiles inbox={badges.inbox} sent={badges.sent} />
        </div>
        <div className="md:col-span-7 md:col-start-1 md:row-span-2 md:row-start-1">
          <Latest messages={messages} loading={inbox.isLoading} onShare={() => setShareOpen(true)} />
        </div>
        <div className="md:col-span-5 md:col-start-8 md:row-start-2">
          <LinkCard username={profile.username} onMore={() => setShareOpen(true)} />
        </div>
        <div className="md:col-span-7 md:col-start-1 md:row-start-3">
          <AskPreview />
        </div>
        <div className="md:col-span-5 md:col-start-8 md:row-start-3">
          <GetStarted hasPhoto={!!profile.avatar_url} hasBio={!!profile.bio?.trim()} hasMessage={messages.length > 0} onShare={() => setShareOpen(true)} />
        </div>
        <div className="md:col-span-7 md:col-start-1 md:row-start-4">
          <FindSomeone />
        </div>
      </div>
      <ShareDialog open={shareOpen} onOpenChange={setShareOpen} username={profile.username} />
      <MobileNav />
    </main>
  );
}

// The newest message as the hero, the next two as smaller bubbles.
function Latest({ messages, loading, onShare }: { messages: InboxMsg[]; loading: boolean; onShare: () => void }) {
  const H = t.home;
  if (loading)
    return (
      <section aria-label={H.latest}>
        <Skeleton className="h-56 rounded-[36px_36px_36px_10px]" />
        <Skeleton className="mt-4 h-20 max-w-md rounded-[26px_26px_26px_8px]" />
      </section>
    );
  if (messages.length === 0)
    return (
      <section aria-labelledby="latest-title" className="rounded-[36px_36px_36px_10px] border-2 border-dashed border-primary/20 p-8 md:p-10">
        <MessageCircle className="size-8 text-primary" aria-hidden="true" />
        <h2 id="latest-title" className="mt-4 text-2xl font-extrabold">{H.emptyTitle}</h2>
        <p className="mt-2 max-w-sm text-muted-foreground">{H.emptyBody}</p>
        <Button variant="hero" className="mt-6" onClick={onShare}><Share2 /> {t.inbox.shareLink}</Button>
      </section>
    );
  const [first, ...rest] = messages;
  return (
    <section aria-labelledby="latest-title">
      <h2 id="latest-title" className="mb-3 px-1 text-sm font-semibold text-muted-foreground">{H.latest}</h2>
      {first && (
        <Link
          to="/inbox"
          search={{ m: first.id }}
          className="press group relative block rounded-[36px_36px_36px_10px] bg-brand p-7 text-brand-foreground shadow-[0_24px_60px_-28px_oklch(0.29_0.1_264/0.65)] outline-none focus-visible:ring-4 focus-visible:ring-ring/40 md:p-10"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-brand-foreground/75">
            {t.inbox.anonymous}
            <span aria-hidden="true">·</span>
            {timeAgo(first.created_at)}
            {!first.read_at && <span className="ml-1 rounded-full bg-caramel px-2 py-0.5 text-[11px] font-bold text-coral-foreground">{H.newLabel}</span>}
          </span>
          <p className="mt-4 line-clamp-5 whitespace-pre-wrap break-words text-[1.45rem] font-semibold leading-snug [overflow-wrap:anywhere] md:text-[1.9rem]">
            {first.body}
          </p>
        </Link>
      )}
      {rest.length > 0 && (
        <ul className="mt-6 space-y-3">
          {rest.slice(0, 2).map((m) => (
            <li key={m.id}>
              <Link
                to="/inbox"
                search={{ m: m.id }}
                className={cn("glass press flex items-start gap-3 rounded-[24px_24px_24px_8px] px-5 py-4 hover:bg-accent/60", m.read_at && "glass-read")}
              >
                <span className={cn("mt-2 size-2 shrink-0 rounded-full", m.read_at ? "bg-transparent" : "bg-primary")} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 break-words font-medium [overflow-wrap:anywhere]">{m.body}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">{timeAgo(m.created_at)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link to="/inbox" className="mt-4 inline-flex rounded-lg px-1 py-2 text-sm font-semibold text-primary hover:underline">
        {H.seeAll}
      </Link>
    </section>
  );
}

// Inbox and Sent side by side, each a big tap target with its status.
function StatusTiles({ inbox, sent }: { inbox: number; sent: number }) {
  const H = t.home;
  const tile = "press flex min-h-[104px] flex-1 flex-col justify-between gap-3 p-5 outline-none hover:bg-accent/60 focus-visible:bg-accent";
  return (
    <nav aria-label={H.inbox} className="glass flex overflow-hidden rounded-[28px]">
      <Link to="/inbox" className={cn(tile, "border-r border-glass-border")}>
        <span className="flex items-center justify-between">
          <Inbox className="size-5 text-primary" aria-hidden="true" />
          <CountBadge n={inbox} />
        </span>
        <span>
          <span className="block text-lg font-bold">{H.inbox}</span>
          <span className="block text-sm text-muted-foreground">{H.inboxStatus(inbox)}</span>
        </span>
      </Link>
      <Link to="/sent" className={tile}>
        <span className="flex items-center justify-between">
          <Send className="size-5 text-primary" aria-hidden="true" />
          <CountBadge n={sent} />
        </span>
        <span>
          <span className="block text-lg font-bold">{H.sent}</span>
          <span className="block text-sm text-muted-foreground">{H.sentStatus(sent)}</span>
        </span>
      </Link>
    </nav>
  );
}

function LinkCard({ username, onMore }: { username: string; onMore: () => void }) {
  const H = t.home;
  const link = useProfileLink(username);
  const { copied, canShare, copy, share } = useCopyShare(link);
  return (
    <section aria-labelledby="link-title" className="glass rounded-[28px] p-5">
      <h2 id="link-title" className="flex items-center gap-2 text-lg font-bold"><Link2 className="size-5 text-primary" aria-hidden="true" /> {H.linkTitle}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{H.linkBody}</p>
      <p className="mt-4 truncate rounded-2xl bg-field px-4 py-3 font-mono text-sm" title={link}>{shortLink(link)}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="hero" onClick={copy}>{copied ? <Check /> : <Copy />} {t.shareDialog.copyShort}</Button>
        {canShare ? (
          <Button variant="secondary" onClick={share}><Share2 /> {t.common.share}</Button>
        ) : (
          <Button variant="secondary" onClick={onMore}><QrCode /> {H.moreWays}</Button>
        )}
      </div>
      {canShare && (
        <button type="button" onClick={onMore} className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-1 py-1 text-sm font-semibold text-primary hover:underline">
          <QrCode className="size-4" aria-hidden="true" /> {H.moreWays}
        </button>
      )}
    </section>
  );
}

// A short checklist for new students. It disappears once everything is done.
function GetStarted({ hasPhoto, hasBio, hasMessage, onShare }: { hasPhoto: boolean; hasBio: boolean; hasMessage: boolean; onShare: () => void }) {
  const H = t.home;
  const [shared, setShared] = useState(false);
  useEffect(() => {
    setShared(linkWasShared());
    const again = () => setShared(linkWasShared());
    window.addEventListener("wc-link-shared", again);
    return () => window.removeEventListener("wc-link-shared", again);
  }, []);
  const steps = [
    { done: hasPhoto, label: H.stepPhoto, Icon: Camera, to: "/profile" as const },
    { done: hasBio, label: H.stepBio, Icon: PenLine, to: "/profile" as const },
    { done: shared, label: H.stepShare, Icon: Share2, action: onShare },
    { done: hasMessage, label: H.stepFirst, Icon: MessageCircle },
  ];
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  const row = "flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 py-2 text-left";
  return (
    <section aria-labelledby="start-title" className="rounded-[28px] border border-glass-border p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="start-title" className="text-lg font-bold">{H.startTitle}</h2>
        <span className="text-sm text-muted-foreground">{H.startProgress(done, steps.length)}</span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div className="h-full rounded-full bg-brand transition-[width] duration-500" style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <ul className="mt-3 space-y-1">
        {steps.map(({ done: isDone, label, Icon, to, action }) => {
          const content = (
            <>
              <span className={cn("grid size-8 shrink-0 place-items-center rounded-full", isDone ? "bg-primary text-primary-foreground" : "bg-accent text-primary")}>
                {isDone ? <Check className="size-4" aria-hidden="true" /> : <Icon className="size-4" aria-hidden="true" />}
              </span>
              <span className={cn("font-medium", isDone && "text-muted-foreground line-through decoration-1")}>{label}</span>
            </>
          );
          return (
            <li key={label}>
              {!isDone && to ? (
                <Link to={to} className={cn(row, "press hover:bg-accent/60")}>{content}</Link>
              ) : !isDone && action ? (
                <button type="button" onClick={action} className={cn(row, "press hover:bg-accent/60")}>{content}</button>
              ) : (
                <div className={row}>{content}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// The three hottest questions on Ask, and a way in.
function AskPreview() {
  const A = t.ask;
  const top = useQuery({ ...askTopQuery(), ...live });
  const items = top.data ?? [];
  return (
    <section aria-labelledby="ask-title">
      <div className="mb-3 flex items-end justify-between gap-3 px-1">
        <div>
          <h2 id="ask-title" className="flex items-center gap-2 text-lg font-bold"><MessagesSquare className="size-5 text-primary" aria-hidden="true" /> {A.homeTitle}</h2>
          <p className="text-sm text-muted-foreground">{A.homeBody}</p>
        </div>
        <Button asChild variant="secondary" size="sm" className="shrink-0"><Link to="/ask"><Plus /> {A.homeCta}</Link></Button>
      </div>
      {top.isLoading ? (
        <Skeleton className="h-40 rounded-[28px]" />
      ) : items.length === 0 ? (
        <Link to="/ask" className="press block rounded-[28px] border-2 border-dashed border-primary/20 p-6 text-muted-foreground hover:bg-accent/40">{A.empty}</Link>
      ) : (
        <ul className="glass divide-y divide-glass-border overflow-hidden rounded-[28px]">
          {items.map((p) => (
            <li key={p.id}>
              <Link to="/ask/$id" params={{ id: p.id }} className="press flex items-start gap-4 px-5 py-4 hover:bg-accent/60 focus-visible:bg-accent">
                <span className="flex w-9 shrink-0 flex-col items-center pt-0.5 text-sm font-bold tabular-nums text-primary" aria-label={A.votes(p.score)}>
                  <ArrowBigUp className="size-5" aria-hidden="true" />
                  {p.score}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 break-words font-semibold [overflow-wrap:anywhere]">{p.body}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">{p.answer_count ? A.answers(p.answer_count) : A.noAnswersYet} · {timeAgo(p.published_at)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {items.length > 0 && (
        <Link to="/ask" className="mt-3 inline-flex rounded-lg px-1 py-2 text-sm font-semibold text-primary hover:underline">{A.homeSeeAll}</Link>
      )}
    </section>
  );
}

function FindSomeone() {
  const H = t.home;
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const q = text.trim();
    void navigate({ to: "/search", search: q ? { q } : {} });
  };
  return (
    <section aria-labelledby="find-title">
      <h2 id="find-title" className="mb-3 px-1 text-lg font-bold">{H.findTitle}</h2>
      <form onSubmit={submit} className="flex gap-2" role="search">
        <label htmlFor="home-find" className="sr-only">{H.findPlaceholder}</label>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input id="home-find" value={text} onChange={(e) => setText(e.target.value)} placeholder={H.findPlaceholder} maxLength={40} className="h-12 rounded-2xl pl-11" autoComplete="off" />
        </div>
        <Button type="submit" variant="secondary" className="h-12 rounded-2xl px-5">{H.findButton}</Button>
      </form>
    </section>
  );
}
