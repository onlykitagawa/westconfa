import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Supabase requests are lazy: nothing is sent until the call is awaited. This fake behaves the
// same way, so these tests fail if a request is created but never awaited. That exact bug made
// cleared red marks come back after changing page.
const mocks = vi.hoisted(() => ({
  sent: [] as { name: string; args: unknown }[],
  error: null as null | { message: string },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (name: string, args: unknown) => ({
      then: (onFulfilled: (v: { data: null; error: null | { message: string } }) => unknown, onRejected?: (e: unknown) => unknown) => {
        mocks.sent.push({ name, args });
        return Promise.resolve({ data: null, error: mocks.error }).then(onFulfilled, onRejected);
      },
    }),
  },
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ profile: null }) }));
import { INBOX_KEY, markSentSeen, markThreadSeen, SENT_KEY, type InboxMsg, type SentItem } from "@/lib/inbox-data";

const client = () => new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } });
const sentItem = (id: string, new_reply: boolean): SentItem => ({
  message_id: id,
  state: "seen",
  sent_at: "2026-11-16T10:00:00Z",
  body: "hi",
  to_username: "zeo",
  to_name: "Zeo",
  reply_count: 1,
  awaiting_you: true,
  new_reply,
});
const inboxMsg = (id: string): InboxMsg => ({ id, body: "hi", created_at: "2026-11-16T10:00:00Z", read_at: "2026-11-16T10:01:00Z", replies_closed: false, owner_seen_at: null });

beforeEach(() => {
  mocks.sent.length = 0;
  mocks.error = null;
});

describe("clearing a red 'new reply' mark", () => {
  it("opening a sent message really saves it as seen and clears only that mark", async () => {
    const qc = client();
    qc.setQueryData<SentItem[]>(SENT_KEY, [sentItem("m1", true), sentItem("m2", true)]);
    expect(await markSentSeen(qc, "m1")).toBe(true);
    expect(mocks.sent).toEqual([{ name: "mark_sent_seen", args: { _message_id: "m1" } }]);
    expect(qc.getQueryData<SentItem[]>(SENT_KEY)?.map((m) => m.new_reply)).toEqual([false, true]);
  });

  it("opening an inbox conversation really saves it as seen", async () => {
    const qc = client();
    qc.setQueryData<InboxMsg[]>(INBOX_KEY, [inboxMsg("m1"), inboxMsg("m2")]);
    expect(await markThreadSeen(qc, "m1")).toBe(true);
    expect(mocks.sent).toEqual([{ name: "mark_thread_seen", args: { _message_id: "m1" } }]);
    const [first, second] = qc.getQueryData<InboxMsg[]>(INBOX_KEY) ?? [];
    expect(first?.owner_seen_at).not.toBeNull();
    expect(second?.owner_seen_at).toBeNull();
  });

  it("reports failure when the save is refused, so the mark can come back honestly", async () => {
    mocks.error = { message: "Forbidden" };
    const qc = client();
    qc.setQueryData<SentItem[]>(SENT_KEY, [sentItem("m1", true)]);
    expect(await markSentSeen(qc, "m1")).toBe(false);
    expect(await markThreadSeen(qc, "m1")).toBe(false);
    expect(mocks.sent.map((c) => c.name)).toEqual(["mark_sent_seen", "mark_thread_seen"]);
  });
});
