import { useQuery, type QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

// Shared queries for the inbox, the Sent page and the badges in the navigation. Using the same
// query keys everywhere means a message marked read in the inbox updates the badge immediately.

export type InboxMsg = { id: string; body: string; created_at: string; read_at: string | null; replies_closed: boolean; owner_seen_at: string | null };
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
};
type ReplyRow = { message_id: string; author: string; status: string; created_at: string };

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
        .select("id, body, created_at, read_at, replies_closed, owner_seen_at")
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

// Light rows (no text) for the "New reply" / "Replied" labels.
export function useInboxReplies() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: REPLIES_KEY,
    enabled: !!profile?.id,
    refetchOnWindowFocus: true,
    refetchInterval: REFRESH_MS,
    queryFn: async (): Promise<ReplyRow[]> => {
      const { data, error } = await supabase.from("message_replies").select("message_id, author, status, created_at").order("created_at", { ascending: true }).limit(1000);
      if (error) throw error;
      return data ?? [];
    },
  });
}

// Per conversation: has the recipient replied, and is there a sender reply they haven't opened yet.
// "New" = an approved sender reply newer than the last time the recipient opened the message.
export function threadStates(rows: ReplyRow[] | undefined, messages: InboxMsg[] | undefined) {
  const seen = new Map((messages ?? []).map((m) => [m.id, m.owner_seen_at ? Date.parse(m.owner_seen_at) : 0]));
  const map = new Map<string, { replied: boolean; newReply: boolean }>();
  for (const r of rows ?? []) {
    if (!seen.has(r.message_id)) continue;
    const cur = map.get(r.message_id) ?? { replied: false, newReply: false };
    if (r.author === "owner") cur.replied = true;
    if (r.author === "sender" && r.status === "approved" && Date.parse(r.created_at) > (seen.get(r.message_id) ?? 0)) cur.newReply = true;
    map.set(r.message_id, cur);
  }
  return map;
}

// Opening a conversation clears its "new reply" mark. The mark is saved in the database, so it
// stays cleared on every page and every device.
//
// IMPORTANT: Supabase requests are lazy. Nothing is sent until the call is awaited, so a bare
// `void supabase.rpc(...)` silently does nothing (that bug made cleared marks come back).
// Order: stop any refresh that is in flight, clear the mark on screen, save it, then re-read the
// truth from the server (which also restores the mark if saving failed).
export async function markThreadSeen(qc: QueryClient, id: string): Promise<boolean> {
  try {
    await qc.cancelQueries({ queryKey: INBOX_KEY });
    const replies = qc.getQueryData<ReplyRow[]>(REPLIES_KEY) ?? [];
    const newest = Math.max(Date.now(), ...replies.filter((r) => r.message_id === id).map((r) => Date.parse(r.created_at)));
    const seenAt = new Date(newest).toISOString();
    qc.setQueryData<InboxMsg[]>(INBOX_KEY, (l) => l?.map((m) => (m.id === id ? { ...m, owner_seen_at: seenAt } : m)));
    const { error } = await supabase.rpc("mark_thread_seen", { _message_id: id });
    return !error;
  } catch {
    return false;
  } finally {
    void qc.invalidateQueries({ queryKey: INBOX_KEY });
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
  for (const [, st] of threadStates(replies.data, inbox.data)) if (st.newReply) newReplies += 1;
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
