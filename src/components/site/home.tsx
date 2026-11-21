import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowBigUp, ArrowRight, Camera, Check, ChevronRight, Copy, Mail, MessagesSquare, PenLine, Plus, QrCode, Reply, Share2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { t, timeAgo } from "@/i18n";
import { useAuth } from "@/lib/auth";
import { threadStates, useInboxMessages, useInboxReplies, useSentMessages } from "@/lib/inbox-data";
import { askMineQuery, askTopQuery } from "@/lib/ask-data";
import { live, LIVE_MS } from "@/lib/live";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MobileNav } from "./chrome";
import { BUBBLE_PATH } from "./brand-mark";
import { linkWasShared, ShareDialog, shortLink, useCopyShare, useProfileLink } from "./share-dialog";

// The signed-in home page. One bold piece, the hero: a deep brand panel where the newest thing waiting
// for you sits as a white speech bubble (the same bubbles as the front page). Everything else stays
// quiet: the rest of what's new, your link as a pass with its QR code, and the campus questions.
// The "new" count always matches the red badges in the menu.
function dayPart(): "morning" | "afternoon" | "evening" {
  const h = new Date().getHours();
  return h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
}

type NewItem = {
  key: string;
  kind: "message" | "inboxReply" | "sentReply" | "askAnswers";
  text: string;
  note?: string | undefined;
  at?: string | undefined;
  link: { to: "/inbox"; search: { m: string } } | { to: "/sent"; search: { m: string } } | { to: "/ask/$id"; params: { id: string } };
};

const kindTitle = (k: NewItem["kind"]) => ({ message: t.home.newMessage, inboxReply: t.home.newInboxReply, sentReply: t.home.newSentReply, askAnswers: t.home.newAskAnswers })[k];
const KIND_ICON = { message: Mail, inboxReply: Reply, sentReply: Reply, askAnswers: MessagesSquare } as const;
const MAX_MORE = 5;

export function Home() {
  const { profile } = useAuth();
  const inbox = useInboxMessages(LIVE_MS);
  const replies = useInboxReplies(LIVE_MS);
  const sent = useSentMessages(LIVE_MS);
  const mine = useQuery({ ...askMineQuery(), ...live, enabled: !!profile?.username });
  const [shareOpen, setShareOpen] = useState(false);
  const [part, setPart] = useState<"morning" | "afternoon" | "evening">("evening");
  useEffect(() => setPart(dayPart()), []);
  if (!profile?.username) return null;
  const name = (profile.display_name || profile.username).split(" ")[0] ?? profile.username;

  // Worked out exactly like the badges (useBadges, useAskBadge), so the numbers always agree.
  const messages = inbox.data ?? [];
  const items: NewItem[] = [];
  for (const m of messages) if (!m.read_at) items.push({ key: `m-${m.id}`, kind: "message", text: m.body, at: m.created_at, link: { to: "/inbox", search: { m: m.id } } });
  const threads = threadStates(replies.data, inbox.data);
  for (const m of messages) if (threads.get(m.id)?.newReply) items.push({ key: `r-${m.id}`, kind: "inboxReply", text: m.body, link: { to: "/inbox", search: { m: m.id } } });
  for (const x of sent.data ?? [])
    if (x.new_reply && x.message_id)
      items.push({ key: `s-${x.message_id}`, kind: "sentReply", text: x.body ?? "", note: x.to_username ? t.home.toWhom(x.to_username) : undefined, link: { to: "/sent", search: { m: x.message_id } } });
  for (const q of mine.data ?? []) if (q.new_answers) items.push({ key: `a-${q.id}`, kind: "askAnswers", text: q.body, link: { to: "/ask/$id", params: { id: q.id } } });
  const loading = inbox.isLoading || sent.isLoading;

  // Phone: one column in reading order. Laptop: the hero and what's new on the left, the pass,
  // next step and campus questions on the right (the wrappers only exist from md up).
  return (
    <main className="mx-auto max-w-6xl px-4 pb-6 pt-5 md:px-6 md:pt-10">
      <div className="flex flex-col gap-8 md:grid md:grid-cols-12 md:items-start md:gap-8">
        <div className="contents md:col-span-7 md:flex md:flex-col md:gap-8">
          <div className="order-1 md:order-none">
            <Hero name={name} part={part} items={items} loading={loading} hasMessages={messages.length > 0} onShare={() => setShareOpen(true)} />
          </div>
          {items.length > 1 && (
            <div className="order-3 md:order-none">
              <MoreNew items={items.slice(1)} />
            </div>
          )}
        </div>
        <div className="contents md:col-span-5 md:flex md:flex-col md:gap-8">
          <div className="order-2 empty:hidden md:order-none">
            <NextStep hasPhoto={!!profile.avatar_url} hasBio={!!profile.bio?.trim()} onShare={() => setShareOpen(true)} />
          </div>
          <div className="order-4 md:order-none">
            <LinkPass username={profile.username} onMore={() => setShareOpen(true)} />
          </div>
          <div className="order-5 md:order-none">
            <AskPreview />
          </div>
        </div>
      </div>
      <ShareDialog open={shareOpen} onOpenChange={setShareOpen} username={profile.username} />
      <MobileNav />
    </main>
  );
}

function Hero({ name, part, items, loading, hasMessages, onShare }: { name: string; part: "morning" | "afternoon" | "evening"; items: NewItem[]; loading: boolean; hasMessages: boolean; onShare: () => void }) {
  const H = t.home;
  const first = items[0];
  return (
    <section aria-labelledby="hello" className="relative isolate overflow-hidden rounded-[36px] bg-brand px-6 pb-7 pt-7 text-brand-foreground shadow-[0_34px_70px_-34px_oklch(0.29_0.1_264/0.75)] md:px-10 md:pb-10 md:pt-10">
      <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-32 -z-10 size-96 rounded-full bg-[oklch(0.68_0.15_265/0.45)] blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 -left-16 -z-10 size-64 rounded-full bg-caramel/25 blur-3xl" />
      <svg aria-hidden="true" viewBox="0 0 64 64" className="pointer-events-none absolute -bottom-14 -right-10 -z-10 w-64 -rotate-12 text-white/[0.07] md:w-80">
        <path d={BUBBLE_PATH} fill="currentColor" />
      </svg>

      <h1 id="hello" className="text-[2rem] font-extrabold leading-[1.05] tracking-tight md:text-5xl">{H.greeting(part, name)}</h1>
      <p className="mt-2 flex items-center gap-2 text-base text-brand-foreground/80 md:text-lg" aria-live="polite">
        {!loading && items.length > 0 && <span className="grid h-6 min-w-6 place-items-center rounded-full bg-caramel px-1.5 text-xs font-extrabold text-[var(--brand-ink)]">{items.length}</span>}
        {loading ? " " : H.summary(items.length)}
      </p>

      <div className="mt-7 md:mt-9">
        {loading ? (
          <div className="h-36 animate-pulse rounded-[28px_28px_28px_10px] bg-white/15" />
        ) : first ? (
          <Link
            {...first.link}
            className="press group block max-w-xl -rotate-1 rounded-[28px_28px_28px_10px] bg-qr-surface p-5 text-[var(--brand-ink)] shadow-[0_24px_50px_-24px_oklch(0.15_0.05_264/0.8)] outline-none transition-transform hover:rotate-0 focus-visible:rotate-0 focus-visible:ring-4 focus-visible:ring-caramel md:p-6"
          >
            <span className="flex items-center gap-2 text-xs font-bold text-[var(--brand-ink)]/60">
              <span className="size-2 rounded-full bg-caramel" aria-hidden="true" />
              {kindTitle(first.kind)}
            </span>
            <span className="mt-3 line-clamp-4 block whitespace-pre-wrap break-words text-xl font-semibold leading-snug [overflow-wrap:anywhere] md:text-2xl">{first.text}</span>
            {first.note && <span className="mt-2 block text-sm text-[var(--brand-ink)]/60">{first.note}</span>}
            <span className="mt-5 flex items-center gap-3 text-sm">
              <span className="inline-flex items-center gap-1.5 font-bold">
                {H.open} <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </span>
              {first.at && <span className="ml-auto text-xs text-[var(--brand-ink)]/55">{timeAgo(first.at)}</span>}
            </span>
          </Link>
        ) : (
          <div className="max-w-xl -rotate-1 rounded-[28px_28px_28px_10px] bg-qr-surface p-5 text-[var(--brand-ink)] shadow-[0_24px_50px_-24px_oklch(0.15_0.05_264/0.8)] md:p-6">
            <p className="text-xl font-bold leading-snug md:text-2xl">{H.nothingNew}</p>
            <p className="mt-2 text-sm text-[var(--brand-ink)]/70">{hasMessages ? H.nothingNewBody : H.nothingNewNoMessages}</p>
            <button type="button" onClick={onShare} className="press mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-brand px-5 text-sm font-bold text-brand-foreground">
              <Share2 className="size-4" aria-hidden="true" /> {H.shareLink}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

// Everything new after the first one, as small bubbles.
function MoreNew({ items }: { items: NewItem[] }) {
  const H = t.home;
  return (
    <section aria-labelledby="more-new">
      <h2 id="more-new" className="mb-3 px-1 text-lg font-bold">{H.alsoNew}</h2>
      <ul className="space-y-2.5">
        {items.slice(0, MAX_MORE).map((it) => {
          const Icon = KIND_ICON[it.kind];
          return (
            <li key={it.key}>
              <Link {...it.link} className="glass press flex items-center gap-4 rounded-[22px_22px_22px_8px] px-4 py-3.5 outline-none hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring">
                <span className={cn("grid size-10 shrink-0 place-items-center rounded-full", it.kind === "message" ? "bg-brand text-brand-foreground" : "bg-accent text-primary")}>
                  <Icon className="size-[18px]" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold leading-snug">{kindTitle(it.kind)}</span>
                  <span className="block truncate text-sm text-muted-foreground">“{it.text}”</span>
                </span>
                {it.at && <span className="shrink-0 self-start pt-0.5 text-xs text-muted-foreground">{timeAgo(it.at)}</span>}
                <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              </Link>
            </li>
          );
        })}
      </ul>
      {items.length > MAX_MORE && (
        <Link to="/inbox" className="mt-3 inline-flex rounded-lg px-1 py-2 text-sm font-semibold text-primary hover:underline">{H.seeInbox}</Link>
      )}
    </section>
  );
}

// Your link as a pass: the QR code people can scan, @username, and one-tap Copy / Share.
function LinkPass({ username, onMore }: { username: string; onMore: () => void }) {
  const H = t.home;
  const link = useProfileLink(username);
  const { copied, canShare, copy, share } = useCopyShare(link);
  return (
    <section aria-labelledby="pass-title" className="glass overflow-hidden rounded-[30px]">
      <div className="flex items-center gap-5 p-5">
        <button type="button" onClick={onMore} aria-label={H.moreWays} className="press shrink-0 rounded-2xl bg-qr-surface p-2.5 shadow-soft">
          <QRCodeSVG value={link || " "} size={84} level="M" bgColor="var(--qr-surface)" fgColor="var(--qr-ink)" />
        </button>
        <div className="min-w-0">
          <h2 id="pass-title" className="text-xs font-bold text-muted-foreground">{H.linkTitle}</h2>
          <p className="mt-1 truncate text-2xl font-extrabold tracking-tight">@{username}</p>
          <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground" title={link}>{shortLink(link)}</p>
        </div>
      </div>
      {/* the pass's tear line */}
      <div aria-hidden="true" className="mx-5 border-t-2 border-dashed border-primary/15" />
      <div className="p-5 pt-4">
        <p className="text-sm text-muted-foreground">{H.linkBody}</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="hero" onClick={copy}>{copied ? <Check /> : <Copy />} {t.shareDialog.copyShort}</Button>
          {canShare ? (
            <Button variant="secondary" onClick={share}><Share2 /> {t.common.share}</Button>
          ) : (
            <Button variant="secondary" onClick={onMore}><QrCode /> {H.moreWays}</Button>
          )}
        </div>
      </div>
    </section>
  );
}

// One line for new students: the next thing to set up. Disappears once everything is done.
function NextStep({ hasPhoto, hasBio, onShare }: { hasPhoto: boolean; hasBio: boolean; onShare: () => void }) {
  const H = t.home;
  const [shared, setShared] = useState(true);
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
  ];
  const left = steps.filter((x) => !x.done);
  const next = left[0];
  if (!next) return null;
  const inner = (
    <>
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-caramel/40 text-foreground">
        <next.Icon className="size-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-xs font-semibold text-muted-foreground">{H.stepsLeft(left.length)}</span>
        <span className="block font-bold">{next.label}</span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
    </>
  );
  const cls = "press flex w-full items-center gap-4 rounded-[24px] border border-caramel/60 bg-caramel/10 px-4 py-3 hover:bg-caramel/20";
  return next.to ? <Link to={next.to} className={cls}>{inner}</Link> : <button type="button" onClick={next.action} className={cls}>{inner}</button>;
}

function AskPreview() {
  const A = t.ask;
  const top = useQuery({ ...askTopQuery(), ...live });
  const items = top.data ?? [];
  return (
    <section aria-labelledby="ask-title">
      <div className="mb-3 flex items-end justify-between gap-3 px-1">
        <div>
          <h2 id="ask-title" className="text-lg font-bold">{A.homeTitle}</h2>
          <p className="text-sm text-muted-foreground">{A.homeBody}</p>
        </div>
        <Button asChild variant="secondary" size="sm" className="shrink-0"><Link to="/ask"><Plus /> {A.homeCta}</Link></Button>
      </div>
      {top.isLoading ? (
        <Skeleton className="h-40 rounded-[22px]" />
      ) : items.length === 0 ? (
        <Link to="/ask" className="glass press block rounded-[22px_22px_22px_8px] p-5 text-muted-foreground hover:bg-accent/40">{A.empty}</Link>
      ) : (
        <ul className="space-y-2.5">
          {items.map((p, i) => (
            <li key={p.id} className={cn("flex", i % 2 ? "justify-end pl-6" : "pr-6")}>
              <Link
                to="/ask/$id"
                params={{ id: p.id }}
                className={cn(
                  "glass press block w-full px-4 py-3.5 outline-none hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring",
                  i % 2 ? "rounded-[22px_22px_8px_22px]" : "rounded-[22px_22px_22px_8px]",
                )}
              >
                <span className="line-clamp-2 break-words font-semibold leading-snug [overflow-wrap:anywhere]">{p.body}</span>
                <span className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1 font-bold text-primary" aria-label={A.votes(p.score)}>
                    <ArrowBigUp className="size-4" aria-hidden="true" />{p.score}
                  </span>
                  <span>{p.answer_count ? A.answers(p.answer_count) : A.noAnswersYet}</span>
                  <span className="ml-auto">{timeAgo(p.published_at)}</span>
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
