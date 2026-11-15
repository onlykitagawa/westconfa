import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

// Shared queries for the inbox, the Sent page and the badges in the navigation. Using the same
// query keys everywhere means a message marked read in the inbox updates the badge immediately.

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
};
type ReplyRow = { message_id: string; author: string; status: string };

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

// Light rows (no text) for the "New reply" / "Replied" labels.
export function useInboxReplies() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: REPLIES_KEY,
    enabled: !!profile?.id,
    refetchOnWindowFocus: true,
    refetchInterval: REFRESH_MS,
    queryFn: async (): Promise<ReplyRow[]> => {
      const { data, error } = await supabase.from("message_replies").select("message_id, author, status").order("created_at", { ascending: true }).limit(1000);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function threadStates(rows: ReplyRow[] | undefined) {
  const map = new Map<string, { replied: boolean; waiting: boolean }>();
  for (const r of rows ?? []) {
    const cur = map.get(r.message_id) ?? { replied: false, waiting: false };
    if (r.author === "owner") cur.replied = true;
    if (r.status === "approved") cur.waiting = r.author === "sender";
    map.set(r.message_id, cur);
  }
  return map;
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

// Numbers for the navigation: unread messages plus conversations waiting for your answer, and
// sent messages that got a reply you haven't answered yet.
export function useBadges() {
  const inbox = useInboxMessages();
  const replies = useInboxReplies();
  const sent = useSentMessages();
  const visible = new Set((inbox.data ?? []).map((m) => m.id));
  const unread = (inbox.data ?? []).filter((m) => !m.read_at).length;
  let waiting = 0;
  for (const [id, s] of threadStates(replies.data)) if (s.waiting && visible.has(id)) waiting += 1;
  const sentReplies = (sent.data ?? []).filter((m) => m.awaiting_you).length;
  return { inbox: unread + waiting, sent: sentReplies };
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
