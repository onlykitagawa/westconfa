import { createFileRoute, Link } from "@tanstack/react-router";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ArrowUp, MessageCircle } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { t, timeAgo } from "@/i18n";
import { askFeedQuery, askMineQuery, type AskFeedItem, type AskMineItem } from "@/lib/ask-data";
import { live } from "@/lib/live";
import { arrangeFeed, feedBase, type FeedBase } from "@/lib/ask-feed";
import { cn } from "@/lib/utils";
import { AskComposer, PostCard } from "@/components/site/ask";
import { CountBadge } from "@/components/site/chrome";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type Tab = "hot" | "new" | "mine";

export const Route = createFileRoute("/_authenticated/ask/")({
  validateSearch: (search: Record<string, unknown>): { tab?: Tab } =>
    search["tab"] === "new" || search["tab"] === "mine" ? { tab: search["tab"] } : {},
  head: () => ({ meta: [{ title: t.ask.metaTitle }, { name: "description", content: t.ask.metaDesc }, { name: "robots", content: "noindex" }] }),
  component: AskPage,
});

function AskPage() {
  const A = t.ask;
  const { tab = "hot" } = Route.useSearch();
  const navigate = Route.useNavigate();
  const mine = useQuery({ ...askMineQuery(), ...live });
  const newOnMine = (mine.data ?? []).filter((p) => p.new_answers).length;
  const tabs: { id: Tab; label: string }[] = [
    { id: "hot", label: A.hot },
    { id: "new", label: A.new },
    { id: "mine", label: A.mine },
  ];

  return (
    <main className="mx-auto max-w-2xl px-4 pb-8 pt-6 md:pt-12">
      <header className="px-1">
        <h1 className="text-4xl font-extrabold tracking-tight">{A.title}</h1>
        <p className="mt-2 text-muted-foreground">{A.subtitle}</p>
      </header>

      <div className="mt-6">
        <AskComposer onPosted={(held) => { if (held) void navigate({ search: { tab: "mine" } }); }} />
      </div>

      <div role="tablist" aria-label={A.sortLabel} className="glass mt-8 flex gap-1 rounded-2xl p-1">
        {tabs.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            aria-selected={tab === x.id}
            onClick={() => void navigate({ search: x.id === "hot" ? {} : { tab: x.id }, replace: true })}
            className={cn(
              "press inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl text-sm font-semibold text-muted-foreground",
              tab === x.id && "bg-brand text-brand-foreground shadow-soft",
            )}
          >
            {x.label}
            {x.id === "mine" && <CountBadge n={newOnMine} />}
          </button>
        ))}
      </div>

      <section className="mt-4" aria-live="polite">
        {tab === "mine" ? <MineList items={mine.data} loading={mine.isLoading} /> : <Feed key={tab} sort={tab} />}
      </section>
    </main>
  );
}

function Feed({ sort }: { sort: "hot" | "new" }) {
  const A = t.ask;
  const q = useInfiniteQuery(askFeedQuery(sort));
  const top = useRef<HTMLDivElement>(null);
  const fresh = useMemo(() => {
    const seen = new Set<string>();
    const out: AskFeedItem[] = [];
    for (const page of q.data?.pages ?? []) for (const p of page) if (!seen.has(p.id)) { seen.add(p.id); out.push(p); }
    return out;
  }, [q.data]);
  const [base, setBase] = useState<FeedBase<AskFeedItem> | null>(null);
  if (base === null && q.isSuccess) setBase(feedBase(fresh));

  if (q.isLoading || (base === null && q.isSuccess)) return <ListSkeleton />;
  if (q.isError && !q.data) return <p className="glass rounded-3xl p-8 text-center text-muted-foreground">{t.common.somethingWrong}</p>;
  const { shown, waiting } = arrangeFeed(base ?? feedBase(fresh), fresh, !q.hasNextPage);
  const showNew = () => {
    setBase(feedBase(fresh));
    top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  if (shown.length === 0 && waiting.length === 0) return <Empty text={A.empty} />;
  return (
    <div ref={top} className="scroll-mt-24">
      {waiting.length > 0 && (
        <div className="sticky top-20 z-20 mb-3 flex justify-center">
          <Button type="button" variant="hero" size="sm" className="shadow-soft" onClick={showNew}>
            <ArrowUp /> {A.newQuestions(waiting.length)}
          </Button>
        </div>
      )}
      <ul className="space-y-3">
        {shown.map((p) => (
          <li key={p.id}><PostCard post={p} /></li>
        ))}
      </ul>
      {q.hasNextPage && (
        <Button variant="secondary" className="mt-4 w-full" disabled={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
          {q.isFetchingNextPage ? t.common.loading : A.loadMore}
        </Button>
      )}
    </div>
  );
}

// The caller's own questions, including the ones still waiting for review.
function MineList({ items, loading }: { items: AskMineItem[] | undefined; loading: boolean }) {
  const A = t.ask;
  if (loading) return <ListSkeleton />;
  if (!items?.length) return <Empty text={A.emptyMine} />;
  const label: Record<string, string> = { pending: A.statusPending, hidden: A.statusHidden, approved: A.statusLive };
  return (
    <ul className="space-y-3">
      {items.map((p) => (
        <li key={p.id}>
          <Link
            to="/ask/$id"
            params={{ id: p.id }}
            className={cn("glass press block rounded-[26px_26px_26px_8px] p-5 hover:bg-accent/40", p.status !== "approved" && "glass-read")}
          >
            <span className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold">
              <span className={cn("rounded-full px-2.5 py-1", p.status === "approved" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground")}>{label[p.status] ?? p.status}</span>
              {p.new_answers && <span className="rounded-full bg-destructive px-2.5 py-1 text-destructive-foreground">{A.newAnswers}</span>}
            </span>
            <span className="line-clamp-4 block whitespace-pre-wrap break-words text-[17px] font-semibold leading-snug [overflow-wrap:anywhere]">{p.body}</span>
            <span className="mt-3 flex items-center gap-3 text-sm text-muted-foreground">
              {p.status === "approved" && (
                <>
                  <span>{A.votes(p.score)}</span>
                  <span className="inline-flex items-center gap-1.5"><MessageCircle className="size-4" aria-hidden="true" />{A.answers(p.answer_count)}</span>
                </>
              )}
              <span className="ml-auto text-xs">{timeAgo(p.published_at ?? p.created_at)}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-[28px] border-2 border-dashed border-primary/20 p-8 text-center">
      <MessageCircle className="mx-auto size-8 text-primary" aria-hidden="true" />
      <p className="mt-3 text-muted-foreground">{text}</p>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => <Skeleton key={i} className="h-32 rounded-[26px_26px_26px_8px]" />)}
    </div>
  );
}
