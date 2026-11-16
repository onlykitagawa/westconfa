import { queryOptions, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

// Shared queries for the inbox, the Sent page and the red badges in the navigation. Using the same
// query keys everywhere means a change on one page updates the badges immediately.
//
// IMPORTANT: Supabase requests are lazy. Nothing is sent until the call is awaited, so a bare
// `void supabase.rpc(...)` silently does nothing (that bug once made cleared marks come back).

export type InboxMsg = { id: string; body: string; created_at: string; read_at: string | null; replies_closed: boolean };
export type SentItem = {
  message_id: string | null;
  state: string;
  sent_at: string;
  body: string | null;
  to_username: string | null;
  to_name: string | null;
  reply_count: number;
  awaiting_you: boolean;
  new_reply: boolean;
  answer: string | null; // the recipient's public answer on their profile, if any
  answered_at: string | null;
};
// One row per inbox conversation that has replies (from my_inbox_threads()).
export type InboxThread = { message_id: string; replied: boolean; new_reply: boolean };

export const INBOX_KEY = ["inbox"];
export const REPLIES_KEY = ["inbox-replies"];
export const SENT_KEY = ["sent"];
const REFRESH_MS = 30_000;

export function useInboxMessages() {
  const { profile } = useAuth();
  const id = profile?.id;
  return useQuery({
    queryKey: INBOX_KEY,
    enabled: !!id,
    refetchOnWindowFocus: true,
    refetchInterval: REFRESH_MS,
    queryFn: async (): Promise<InboxMsg[]> => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, body, created_at, read_at, replies_closed")
        .eq("recipient_id", id ?? "00000000-0000-0000-0000-000000000000")
        .eq("status", "approved")
        .eq("hidden", false)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as InboxMsg[];
    },
  });
}

// Reply state per conversation, worked out in the database and always scoped to the caller's own
// inbox: has the recipient replied, and is there a sender reply they have not been shown yet.
export function useInboxReplies() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: REPLIES_KEY,
    enabled: !!profile?.id,
    refetchOnWindowFocus: true,
    refetchInterval: REFRESH_MS,
    queryFn: async (): Promise<InboxThread[]> => {
      const { data, error } = await supabase.rpc("my_inbox_threads");
      if (error) throw error;
      return data ?? [];
    },
  });
}

// Lookup by message for the list labels. Conversations whose message is not in the loaded list
// are left out, so a badge can never count something the person cannot open.
export function threadStates(rows: InboxThread[] | undefined, messages: InboxMsg[] | undefined) {
  const visible = new Set((messages ?? []).map((m) => m.id));
  const map = new Map<string, { replied: boolean; newReply: boolean }>();
  for (const r of rows ?? []) if (visible.has(r.message_id)) map.set(r.message_id, { replied: r.replied, newReply: r.new_reply });
  return map;
}

// The full conversation under one message. Shared by the open dialog and the "seen" logic below.
export const inboxThreadQuery = (id: string) =>
  queryOptions({
    queryKey: ["inbox-thread", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("message_replies").select("id, author, body, created_at, status").eq("message_id", id).order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
export const sentThreadQuery = (id: string) =>
  queryOptions({
    queryKey: ["sent-thread", id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_sent_thread", { _message_id: id });
      if (error) throw error;
      return data ?? [];
    },
  });

// Saves "this person has now been shown every reply in the conversation" and clears the red mark.
// Order: stop a refresh that is in flight, clear the mark on screen, save, then re-read the truth
// from the server (which also brings the mark back if saving failed).
export async function markThreadSeen(qc: QueryClient, id: string): Promise<boolean> {
  try {
    await qc.cancelQueries({ queryKey: REPLIES_KEY });
    qc.setQueryData<InboxThread[]>(REPLIES_KEY, (l) => l?.map((r) => (r.message_id === id ? { ...r, new_reply: false } : r)));
    const { error } = await supabase.rpc("mark_thread_seen", { _message_id: id });
    return !error;
  } catch {
    return false;
  } finally {
    void qc.invalidateQueries({ queryKey: REPLIES_KEY });
  }
}

export async function markSentSeen(qc: QueryClient, id: string): Promise<boolean> {
  try {
    await qc.cancelQueries({ queryKey: SENT_KEY });
    qc.setQueryData<SentItem[]>(SENT_KEY, (l) => l?.map((m) => (m.message_id === id ? { ...m, new_reply: false } : m)));
    const { error } = await supabase.rpc("mark_sent_seen", { _message_id: id });
    return !error;
  } catch {
    return false;
  } finally {
    void qc.invalidateQueries({ queryKey: SENT_KEY });
  }
}

// Always a new request (never one that started before we knew about the new reply).
async function loadFreshThread(qc: QueryClient, kind: "inbox" | "sent", id: string) {
  if (kind === "inbox") {
    const q = inboxThreadQuery(id);
    await qc.cancelQueries({ queryKey: q.queryKey, exact: true });
    await qc.fetchQuery({ ...q, staleTime: 0 });
  } else {
    const q = sentThreadQuery(id);
    await qc.cancelQueries({ queryKey: q.queryKey, exact: true });
    await qc.fetchQuery({ ...q, staleTime: 0 });
  }
}

// While a conversation is open and has a reply its viewer has not been shown: load the fresh
// conversation first, then save it as seen. It runs again when another reply arrives while the
// conversation is still open, so a red mark is only ever cleared for replies that are really on
// screen. A failed save is not retried until the conversation is opened again (no request loops).
export function useSeenWhenShown(kind: "inbox" | "sent", id: string | null, hasNew: boolean) {
  const qc = useQueryClient();
  const failedFor = useRef<string | null>(null);
  useEffect(() => {
    failedFor.current = null;
  }, [id]);
  useEffect(() => {
    if (!id || !hasNew || failedFor.current === id) return;
    let cancelled = false;
    void (async () => {
      try {
        await loadFreshThread(qc, kind, id);
      } catch {
        return;
      }
      if (cancelled) return;
      const saved = kind === "inbox" ? await markThreadSeen(qc, id) : await markSentSeen(qc, id);
      if (!saved) failedFor.current = id;
    })();
    return () => {
      cancelled = true;
    };
  }, [qc, kind, id, hasNew]);
}

export function useSentMessages() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: SENT_KEY,
    enabled: !!profile?.id,
    refetchOnWindowFocus: true,
    refetchInterval: REFRESH_MS,
    queryFn: async (): Promise<SentItem[]> => {
      const { data, error } = await supabase.rpc("my_sent_messages");
      if (error) throw error;
      return (data ?? []) as SentItem[];
    },
  });
}

// Numbers for the red badges: unread messages plus conversations with a reply you haven't opened
// (inbox), and sent messages with a reply you haven't opened (sent).
export function useBadges() {
  const inbox = useInboxMessages();
  const replies = useInboxReplies();
  const sent = useSentMessages();
  const unread = (inbox.data ?? []).filter((m) => !m.read_at).length;
  let newReplies = 0;
  for (const st of threadStates(replies.data, inbox.data).values()) if (st.newReply) newReplies += 1;
  const sentReplies = (sent.data ?? []).filter((m) => m.new_reply).length;
  return { inbox: unread + newReplies, sent: sentReplies };
}

// The red number on the home-screen icon when the site is installed as an app (where supported).
export function useAppBadge(count: number) {
  useEffect(() => {
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    try {
      if (count > 0) void nav.setAppBadge?.(count)?.catch(() => {});
      else void nav.clearAppBadge?.()?.catch(() => {});
    } catch {
      // not supported
    }
  }, [count]);
}

export function badgeText(n: number) {
  return n > 99 ? "99+" : String(n);
}
