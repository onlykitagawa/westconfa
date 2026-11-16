import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Supabase requests are lazy: nothing is sent until the call is awaited. This fake behaves the
// same way and records only requests that were really sent, so these tests fail if a request is
// created but never awaited. That exact bug made cleared red marks come back after changing page.
const mocks = vi.hoisted(() => {
  const state = {
    sent: [] as { name: string; args: unknown }[],
    errors: {} as Record<string, { message: string } | undefined>,
    gate: null as Promise<void> | null, // when set, conversation loads wait for it
  };
  type Result = { data: unknown; error: { message: string } | null };
  const lazy = (name: string, args: unknown, data: unknown, gated: boolean) => ({
    then: (onFulfilled: (v: Result) => unknown, onRejected?: (e: unknown) => unknown) => {
      state.sent.push({ name, args });
      const wait = gated && state.gate ? state.gate : Promise.resolve();
      return wait.then((): Result => ({ data, error: state.errors[name] ?? null })).then(onFulfilled, onRejected);
    },
  });
  type Chain = { select: () => Chain; eq: () => Chain; order: () => ReturnType<typeof lazy> };
  const supabase = {
    rpc: (name: string, args?: unknown) => lazy(name, args, name === "my_sent_thread" ? [] : null, name === "my_sent_thread"),
    from: (table: string) => {
      const chain: Chain = { select: () => chain, eq: () => chain, order: () => lazy(`load ${table}`, undefined, [], true) };
      return chain;
    },
  };
  return { ...state, state, supabase };
});
vi.mock("@/integrations/supabase/client", () => ({ supabase: mocks.supabase }));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ profile: null }) }));
import { markSentSeen, markThreadSeen, REPLIES_KEY, SENT_KEY, threadStates, useSeenWhenShown, type InboxMsg, type InboxThread, type SentItem } from "@/lib/inbox-data";

const state = mocks.state;
const names = () => state.sent.map((c) => c.name);
const count = (name: string) => names().filter((n) => n === name).length;
const pause = (ms = 25) => new Promise((r) => setTimeout(r, ms));
const client = () => new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } });
const wrap = (qc: QueryClient) => ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: qc }, children);
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
  answer: null,
  answered_at: null,
});
const thread = (id: string, new_reply: boolean): InboxThread => ({ message_id: id, replied: true, new_reply });
const inboxMsg = (id: string): InboxMsg => ({ id, body: "hi", created_at: "2026-11-16T10:00:00Z", read_at: "2026-11-16T10:01:00Z", replies_closed: false });

beforeEach(() => {
  state.sent.length = 0;
  state.errors = {};
  state.gate = null;
});

describe("saving a red 'new reply' mark as seen", () => {
  it("a sent message: the save is really sent and only that mark is cleared", async () => {
    const qc = client();
    qc.setQueryData<SentItem[]>(SENT_KEY, [sentItem("m1", true), sentItem("m2", true)]);
    expect(await markSentSeen(qc, "m1")).toBe(true);
    expect(state.sent).toEqual([{ name: "mark_sent_seen", args: { _message_id: "m1" } }]);
    expect(qc.getQueryData<SentItem[]>(SENT_KEY)?.map((m) => m.new_reply)).toEqual([false, true]);
  });

  it("an inbox conversation: the save is really sent and only that mark is cleared", async () => {
    const qc = client();
    qc.setQueryData<InboxThread[]>(REPLIES_KEY, [thread("m1", true), thread("m2", true)]);
    expect(await markThreadSeen(qc, "m1")).toBe(true);
    expect(state.sent).toEqual([{ name: "mark_thread_seen", args: { _message_id: "m1" } }]);
    expect(qc.getQueryData<InboxThread[]>(REPLIES_KEY)?.map((r) => r.new_reply)).toEqual([false, true]);
  });

  it("reports failure when the save is refused, so the mark can come back honestly", async () => {
    state.errors = { mark_sent_seen: { message: "Forbidden" }, mark_thread_seen: { message: "Forbidden" } };
    const qc = client();
    expect(await markSentSeen(qc, "m1")).toBe(false);
    expect(await markThreadSeen(qc, "m1")).toBe(false);
    expect(names()).toEqual(["mark_sent_seen", "mark_thread_seen"]);
  });
});

describe("list labels", () => {
  it("ignores conversations whose message is not in the loaded inbox", () => {
    const map = threadStates([thread("m1", true), thread("gone", true)], [inboxMsg("m1"), inboxMsg("m2")]);
    expect([...map.keys()]).toEqual(["m1"]);
    expect(map.get("m1")).toEqual({ replied: true, newReply: true });
  });
});

describe("an open conversation with a new reply", () => {
  it("loads the fresh conversation first and only then saves it as seen (Sent page)", async () => {
    const qc = client();
    qc.setQueryData<SentItem[]>(SENT_KEY, [sentItem("m1", true)]);
    renderHook(() => useSeenWhenShown("sent", "m1", true), { wrapper: wrap(qc) });
    await waitFor(() => expect(names()).toEqual(["my_sent_thread", "mark_sent_seen"]));
    expect(qc.getQueryData<SentItem[]>(SENT_KEY)?.[0]?.new_reply).toBe(false);
  });

  it("loads the fresh conversation first and only then saves it as seen (Inbox)", async () => {
    const qc = client();
    qc.setQueryData<InboxThread[]>(REPLIES_KEY, [thread("m1", true)]);
    renderHook(() => useSeenWhenShown("inbox", "m1", true), { wrapper: wrap(qc) });
    await waitFor(() => expect(names()).toEqual(["load message_replies", "mark_thread_seen"]));
    expect(qc.getQueryData<InboxThread[]>(REPLIES_KEY)?.[0]?.new_reply).toBe(false);
  });

  it("does nothing while there is no new reply", async () => {
    renderHook(() => useSeenWhenShown("sent", "m1", false), { wrapper: wrap(client()) });
    await pause();
    expect(names()).toEqual([]);
  });

  it("does not save when the conversation is closed before it finished loading", async () => {
    let release = () => {};
    state.gate = new Promise<void>((r) => (release = r));
    const view = renderHook(({ id }: { id: string | null }) => useSeenWhenShown("sent", id, !!id), { wrapper: wrap(client()), initialProps: { id: "m1" as string | null } });
    await waitFor(() => expect(names()).toEqual(["my_sent_thread"]));
    view.rerender({ id: null });
    release();
    await pause();
    expect(names()).toEqual(["my_sent_thread"]);
  });

  it("does not save when the conversation could not be loaded", async () => {
    state.errors = { my_sent_thread: { message: "offline" } };
    renderHook(() => useSeenWhenShown("sent", "m1", true), { wrapper: wrap(client()) });
    await pause(60);
    expect(count("mark_sent_seen")).toBe(0);
  });

  it("a failed save is not retried in a loop, only when the conversation is opened again", async () => {
    state.errors = { mark_sent_seen: { message: "boom" } };
    type P = { id: string | null; hasNew: boolean };
    const view = renderHook(({ id, hasNew }: P) => useSeenWhenShown("sent", id, hasNew), { wrapper: wrap(client()), initialProps: { id: "m1", hasNew: true } as P });
    await waitFor(() => expect(count("mark_sent_seen")).toBe(1));
    // The list refreshes and still says "new": that must not start another attempt.
    view.rerender({ id: "m1", hasNew: false });
    view.rerender({ id: "m1", hasNew: true });
    await pause(60);
    expect(count("mark_sent_seen")).toBe(1);
    // Closing and opening it again tries once more.
    view.rerender({ id: null, hasNew: false });
    view.rerender({ id: "m1", hasNew: true });
    await waitFor(() => expect(count("mark_sent_seen")).toBe(2));
  });

  it("saves again when another reply arrives while the conversation is still open", async () => {
    type P = { hasNew: boolean };
    const view = renderHook(({ hasNew }: P) => useSeenWhenShown("sent", "m1", hasNew), { wrapper: wrap(client()), initialProps: { hasNew: true } as P });
    await waitFor(() => expect(count("mark_sent_seen")).toBe(1));
    view.rerender({ hasNew: false });
    view.rerender({ hasNew: true });
    await waitFor(() => expect(names()).toEqual(["my_sent_thread", "mark_sent_seen", "my_sent_thread", "mark_sent_seen"]));
  });
});
