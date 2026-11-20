import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowBigUp, Camera, Check, ChevronRight, Copy, Link2, Mail, MessagesSquare, PenLine, Plus, QrCode, Reply, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { t, timeAgo } from "@/i18n";
import { useAuth } from "@/lib/auth";
import { threadStates, useInboxMessages, useInboxReplies, useSentMessages } from "@/lib/inbox-data";
import { askMineQuery, askTopQuery } from "@/lib/ask-data";
import { live, LIVE_MS } from "@/lib/live";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CountBadge, MobileNav } from "./chrome";
import { linkWasShared, ShareDialog, shortLink, useCopyShare, useProfileLink } from "./share-dialog";

// The signed-in home page, kept simple on purpose: one column that answers three plain questions.
// What's new for me? (one list whose count matches the red badges), how do I get messages? (the
// link), and what is the campus asking? (top questions on Ask). New students also see one
// "next step" line until their profile is set up.
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

export function Home() {
  const H = t.home;
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
      items.push({ key: `s-${x.message_id}`, kind: "sentReply", text: x.body ?? "", note: x.to_username ? H.toWhom(x.to_username) : undefined, link: { to: "/sent", search: { m: x.message_id } } });
  for (const q of mine.data ?? []) if (q.new_answers) items.push({ key: `a-${q.id}`, kind: "askAnswers", text: q.body, link: { to: "/ask/$id", params: { id: q.id } } });
  const loading = inbox.isLoading || sent.isLoading;

  return (
    <main className="mx-auto max-w-2xl px-4 pb-6 pt-6 md:pt-12">
      <header className="px-1">
        <h1 className="text-[2rem] font-extrabold leading-tight tracking-tight md:text-5xl">{H.greeting(part, name)}</h1>
        <p className="mt-2 text-base text-muted-foreground md:text-lg" aria-live="polite">{loading ? " " : H.summary(items.length)}</p>
      </header>

      <NextStep hasPhoto={!!profile.avatar_url} hasBio={!!profile.bio?.trim()} onShare={() => setShareOpen(true)} />

      <div className="mt-8 space-y-10">
        <WhatsNew items={items} loading={loading} hasMessages={messages.length > 0} />
        <LinkCard username={profile.username} onMore={() => setShareOpen(true)} />
        <AskPreview />
      </div>
      <ShareDialog open={shareOpen} onOpenChange={setShareOpen} username={profile.username} />
      <MobileNav />
    </main>
  );
}

const KIND_ICON = { message: Mail, inboxReply: Reply, sentReply: Reply, askAnswers: MessagesSquare } as const;
const MAX_NEW = 6;

function WhatsNew({ items, loading, hasMessages }: { items: NewItem[]; loading: boolean; hasMessages: boolean }) {
  const H = t.home;
  const title: Record<NewItem["kind"], string> = { message: H.newMessage, inboxReply: H.newInboxReply, sentReply: H.newSentReply, askAnswers: H.newAskAnswers };
  return (
    <section aria-labelledby="new-title">
      <h2 id="new-title" className="mb-3 flex items-center gap-2 px-1 text-lg font-bold">
        {H.newTitle}
        {items.length > 0 && <CountBadge n={items.length} />}
      </h2>
      {loading ? (
        <Skeleton className="h-36 rounded-[28px]" />
      ) : items.length === 0 ? (
        <div className="rounded-[28px] border-2 border-dashed border-primary/20 p-6">
          <p className="font-semibold">{H.nothingNew}</p>
          <p className="mt-1 text-sm text-muted-foreground">{hasMessages ? H.nothingNewBody : H.nothingNewNoMessages}</p>
        </div>
      ) : (
        <>
          <ul className="glass divide-y divide-glass-border overflow-hidden rounded-[28px]">
            {items.slice(0, MAX_NEW).map((it) => {
              const Icon = KIND_ICON[it.kind];
              return (
                <li key={it.key}>
                  <Link {...it.link} className="press flex items-center gap-4 px-5 py-4 outline-none hover:bg-accent/60 focus-visible:bg-accent">
                    <span className={cn("grid size-11 shrink-0 place-items-center rounded-full", it.kind === "message" ? "bg-brand text-brand-foreground" : "bg-accent text-primary")}>
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold leading-snug">{title[it.kind]}</span>
                      <span className="mt-0.5 block truncate text-sm text-muted-foreground">“{it.text}”</span>
                      {(it.at || it.note) && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{it.at ? timeAgo(it.at) : it.note}</span>}
                    </span>
                    <span className="sr-only">{H.open}</span>
                    <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ul>
          {items.length > MAX_NEW && (
            <Link to="/inbox" className="mt-3 inline-flex rounded-lg px-1 py-2 text-sm font-semibold text-primary hover:underline">{H.seeInbox}</Link>
          )}
        </>
      )}
    </section>
  );
}

function LinkCard({ username, onMore }: { username: string; onMore: () => void }) {
  const H = t.home;
  const link = useProfileLink(username);
  const { copied, canShare, copy, share } = useCopyShare(link);
  return (
    <section aria-labelledby="link-title">
      <h2 id="link-title" className="mb-3 px-1 text-lg font-bold">{H.linkTitle}</h2>
      <div className="glass rounded-[28px] p-5">
        <p className="text-sm text-muted-foreground">{H.linkBody}</p>
        <p className="mt-4 flex items-center gap-2 truncate rounded-2xl bg-field px-4 py-3 font-mono text-sm" title={link}>
          <Link2 className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="truncate">{shortLink(link)}</span>
        </p>
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
  const cls = "press mt-6 flex w-full items-center gap-4 rounded-[24px] border border-caramel/60 bg-caramel/10 px-4 py-3 hover:bg-caramel/20";
  return next.to ? <Link to={next.to} className={cls}>{inner}</Link> : <button type="button" onClick={next.action} className={cls}>{inner}</button>;
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
          <h2 id="ask-title" className="text-lg font-bold">{A.homeTitle}</h2>
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
