import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search as SearchIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { t } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/search")({
  head: () => ({ meta: [{ title: t.search.metaTitle }, { name: "description", content: t.search.metaDesc }, { name: "robots", content: "noindex" }] }),
  component: SearchPage,
});

type Result = { username: string; display_name: string; accepting: boolean };

// Signed-in students only. search_profiles() enforces the 2-character minimum, the result cap,
// the hourly limit and each person's "Show me in search" choice; the page only debounces typing.
function SearchPage() {
  const S = t.search;
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setQuery(text.trim().replace(/^@/, "")), 300);
    return () => clearTimeout(id);
  }, [text]);

  const q = useQuery({
    queryKey: ["search", query.toLowerCase()],
    enabled: query.length >= 2,
    staleTime: 60_000,
    retry: false,
    queryFn: async (): Promise<Result[]> => {
      const { data, error } = await supabase.rpc("search_profiles", { _query: query });
      if (error) throw error;
      return (data ?? []) as Result[];
    },
  });

  const rateLimited = q.isError && /rate_limited/.test(String((q.error as { message?: string } | null)?.message ?? ""));

  return (
    <main className="mx-auto max-w-2xl space-y-4 px-4 pt-4 md:pt-10">
      <h1 className="px-1 text-4xl font-extrabold tracking-tight">{S.title}</h1>
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          type="search"
          autoFocus
          inputMode="search"
          autoComplete="off"
          aria-label={S.placeholder}
          placeholder={S.placeholder}
          maxLength={40}
          className="h-14 rounded-2xl pl-12 text-base"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>

      {query.length < 2 ? (
        <p className="px-1 text-sm text-muted-foreground">{S.hint}</p>
      ) : q.isLoading ? (
        <Skeleton className="h-24 rounded-3xl" />
      ) : q.isError ? (
        <p role="alert" className="glass rounded-3xl p-6 text-center text-muted-foreground">{rateLimited ? S.rate : t.common.somethingWrong}</p>
      ) : !q.data?.length ? (
        <p className="glass rounded-3xl p-6 text-center text-muted-foreground">{S.empty}</p>
      ) : (
        <ul className="space-y-2" aria-live="polite">
          {q.data.map((p) => (
            <li key={p.username}>
              <Link
                to="/u/$username"
                params={{ username: p.username }}
                className="glass press flex items-center gap-4 rounded-2xl p-4 hover:bg-accent/40"
              >
                <span className="grid size-12 shrink-0 place-items-center rounded-full bg-coral text-lg font-extrabold text-coral-foreground" aria-hidden="true">
                  {p.display_name.charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{p.display_name}</span>
                  <span className="block truncate text-sm text-muted-foreground">@{p.username}</span>
                </span>
                {!p.accepting && <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">{S.paused}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="px-1 pt-2 text-xs text-muted-foreground">{S.note}</p>
    </main>
  );
}
