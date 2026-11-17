// Keeps the Ask feed steady while it refreshes every few seconds, so cards never jump under
// someone's finger. `base` is the list as it was first shown (or when "new questions" was tapped).
// Votes and answer counts always come from the fresh data. Questions published after everything in
// the base wait behind a "new questions" button; the reader's own questions show at the top at once;
// older ones that appear (from the next page, or rising in Hot) are added at the end.
export type FeedItem = { id: string; published_at: string; mine: boolean };
export type FeedBase<T extends FeedItem> = { ids: string[]; items: Map<string, T> };

export function feedBase<T extends FeedItem>(fresh: T[]): FeedBase<T> {
  return { ids: fresh.map((p) => p.id), items: new Map(fresh.map((p) => [p.id, p])) };
}

// `complete`: every page has been loaded, so a question missing from the fresh data was really
// deleted or hidden (otherwise it may only have moved to a page that isn't loaded).
export function arrangeFeed<T extends FeedItem>(base: FeedBase<T>, fresh: T[], complete: boolean): { shown: T[]; waiting: T[] } {
  const byId = new Map(fresh.map((p) => [p.id, p]));
  const inBase = new Set(base.ids);
  let newest = "";
  for (const p of base.items.values()) if (p.published_at > newest) newest = p.published_at;

  const top: T[] = [];
  const end: T[] = [];
  const waiting: T[] = [];
  for (const p of fresh) {
    if (inBase.has(p.id)) continue;
    if (p.mine) top.push(p);
    else if (p.published_at > newest) waiting.push(p);
    else end.push(p);
  }
  const kept: T[] = [];
  for (const id of base.ids) {
    const now = byId.get(id);
    if (now) kept.push(now);
    else if (!complete) {
      const old = base.items.get(id);
      if (old) kept.push(old);
    }
  }
  return { shown: [...top, ...kept, ...end], waiting };
}
