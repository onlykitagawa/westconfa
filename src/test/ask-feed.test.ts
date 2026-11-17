import { expect, it } from "vitest";
import { arrangeFeed, feedBase } from "@/lib/ask-feed";

const item = (id: string, minutesAgo: number, extra: Partial<{ mine: boolean; score: number }> = {}) => ({
  id,
  published_at: new Date(Date.UTC(2026, 10, 18, 12, 0) - minutesAgo * 60_000).toISOString(),
  mine: false,
  score: 0,
  ...extra,
});

it("keeps the shown order while votes change, and updates the numbers", () => {
  const base = feedBase([item("a", 10, { score: 5 }), item("b", 20, { score: 3 })]);
  // b overtook a in Hot: the list does not jump, but b's new score is shown.
  const { shown, waiting } = arrangeFeed(base, [item("b", 20, { score: 9 }), item("a", 10, { score: 5 })], true);
  expect(shown.map((p) => p.id)).toEqual(["a", "b"]);
  expect(shown[1]?.score).toBe(9);
  expect(waiting).toEqual([]);
});

it("new questions wait behind the button; my own show at the top; older ones go to the end", () => {
  const base = feedBase([item("a", 10), item("b", 20)]);
  const fresh = [item("new1", 1), item("mine", 2, { mine: true }), item("a", 10), item("old", 30), item("b", 20)];
  const { shown, waiting } = arrangeFeed(base, fresh, true);
  expect(shown.map((p) => p.id)).toEqual(["mine", "a", "b", "old"]);
  expect(waiting.map((p) => p.id)).toEqual(["new1"]);
  // Tapping "new questions" takes the fresh order as the new base.
  expect(arrangeFeed(feedBase(fresh), fresh, true).shown.map((p) => p.id)).toEqual(["new1", "mine", "a", "old", "b"]);
});

it("a deleted question disappears only when every page is loaded", () => {
  const base = feedBase([item("a", 10), item("b", 20)]);
  expect(arrangeFeed(base, [item("a", 10)], true).shown.map((p) => p.id)).toEqual(["a"]);
  expect(arrangeFeed(base, [item("a", 10)], false).shown.map((p) => p.id)).toEqual(["a", "b"]);
});
