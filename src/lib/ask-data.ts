import { infiniteQueryOptions, queryOptions, useQuery, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

// Shared queries for the Ask feed, the question page, the home preview and the nav badge.
// Every read goes through database functions that never return who wrote anything.
// Supabase requests are lazy: always await them (see inbox-data.ts).

export type AskSort = "hot" | "new";
export type AskFeedItem = {
  id: string;
  body: string;
  published_at: string;
  score: number;
  answer_count: number;
  voted: boolean;
  mine: boolean;
  new_answers: boolean;
};
export type AskMineItem = {
  id: string;
  body: string;
  status: string; // "approved" | "pending" | "hidden"
  created_at: string;
  published_at: string | null;
  score: number;
  answer_count: number;
  new_answers: boolean;
};
export type AskPost = { id: string; body: string; status: string; created_at: string; published_at: string | null; score: number; voted: boolean; mine: boolean };
export type AskAnswer = { id: string; body: string; status: string; created_at: string; published_at: string | null; score: number; voted: boolean; mine: boolean; by_asker: boolean };

export const ASK_KEY = ["ask"];
export const PAGE = 20;
const REFRESH_MS = 60_000;

// Pages of PAGE questions. Votes move "hot" around between pages, so the page dedupes by id.
export const askFeedQuery = (sort: AskSort) =>
  infiniteQueryOptions({
    queryKey: [...ASK_KEY, "feed", sort],
    refetchOnWindowFocus: true,
    initialPageParam: 0,
    getNextPageParam: (last: AskFeedItem[], all: AskFeedItem[][]) => (last.length < PAGE ? undefined : all.length * PAGE),
    queryFn: async ({ pageParam }): Promise<AskFeedItem[]> => {
      const { data, error } = await supabase.rpc("ask_feed", { _sort: sort, _limit: PAGE, _offset: pageParam });
      if (error) throw error;
      return (data ?? []) as AskFeedItem[];
    },
  });

// A few top questions for the home page.
export const askTopQuery = () =>
  queryOptions({
    queryKey: [...ASK_KEY, "top"],
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<AskFeedItem[]> => {
      const { data, error } = await supabase.rpc("ask_feed", { _sort: "hot", _limit: 3, _offset: 0 });
      if (error) throw error;
      return (data ?? []) as AskFeedItem[];
    },
  });

export const askMineQuery = () =>
  queryOptions({
    queryKey: [...ASK_KEY, "mine"],
    refetchOnWindowFocus: true,
    refetchInterval: REFRESH_MS,
    queryFn: async (): Promise<AskMineItem[]> => {
      const { data, error } = await supabase.rpc("ask_mine");
      if (error) throw error;
      return (data ?? []) as AskMineItem[];
    },
  });

export const askPostQuery = (id: string) =>
  queryOptions({
    queryKey: [...ASK_KEY, "post", id],
    queryFn: async (): Promise<AskPost | null> => {
      const { data, error } = await supabase.rpc("ask_post", { _id: id });
      if (error) throw error;
      return ((data ?? [])[0] as AskPost | undefined) ?? null;
    },
  });

export const askAnswersQuery = (id: string) =>
  queryOptions({
    queryKey: [...ASK_KEY, "answers", id],
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<AskAnswer[]> => {
      const { data, error } = await supabase.rpc("ask_answers_of", { _post_id: id });
      if (error) throw error;
      return (data ?? []) as AskAnswer[];
    },
  });

// Number of the caller's questions with answers they haven't seen yet (the red mark on "Ask").
export function useAskBadge() {
  const { profile } = useAuth();
  const mine = useQuery({ ...askMineQuery(), enabled: !!profile?.username });
  return (mine.data ?? []).filter((p) => p.new_answers).length;
}

export async function askVote(kind: "post" | "answer", id: string, on: boolean) {
  const { data, error } = await supabase.rpc("ask_vote", { _kind: kind, _id: id, _on: on });
  if (error) throw error;
  return data ?? 0;
}

export async function askReport(kind: "post" | "answer", id: string) {
  const { error } = await supabase.rpc("ask_report", { _kind: kind, _id: id });
  if (error) throw error;
}

export async function askDelete(kind: "post" | "answer", id: string) {
  const { error } = await supabase.rpc("ask_delete", { _kind: kind, _id: id });
  if (error) throw error;
}

// The author has now seen every answer on their question. Awaited, then the badge is refreshed.
export async function askMarkSeen(qc: QueryClient, id: string) {
  const { error } = await supabase.rpc("ask_mark_seen", { _post_id: id });
  if (error) return;
  await qc.cancelQueries({ queryKey: [...ASK_KEY, "mine"] });
  qc.setQueryData<AskMineItem[]>([...ASK_KEY, "mine"], (old) => old?.map((p) => (p.id === id ? { ...p, new_answers: false } : p)));
  void qc.invalidateQueries({ queryKey: [...ASK_KEY, "mine"] });
  void qc.invalidateQueries({ queryKey: [...ASK_KEY, "feed"] });
}
