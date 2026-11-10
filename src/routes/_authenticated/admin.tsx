import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { useState } from "react";
import { toast } from "sonner";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { t } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: t.admin.metaTitle }, { name: "description", content: t.admin.metaDesc }, { property: "og:title", content: t.admin.metaTitle }, { property: "og:description", content: t.admin.metaDesc }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: AdminPage,
});

type Stats = { users: number; active_links: number; messages: number; open_reports: number; per_day: { day: string; count: number }[] };

function AdminPage() {
  const { isAdmin, loading } = useAuth();
  if (loading) return <main className="mx-auto max-w-5xl px-4 pt-10"><Skeleton className="h-40 rounded-3xl" /></main>;
  if (!isAdmin)
    return (
      <main className="mx-auto max-w-md px-5 pt-16 text-center">
        <h1 className="text-2xl font-bold">Admins only</h1>
        <Button asChild variant="hero" className="mt-6"><Link to="/inbox">{t.common.inbox}</Link></Button>
      </main>
    );
  return <AdminInner />;
}

function AdminInner() {
  const A = t.admin;
  const stats = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_stats");
      if (error) throw error;
      return data as unknown as Stats;
    },
  });
  const cards = stats.data
    ? [[A.users, stats.data.users], [A.links, stats.data.active_links], [A.messages, stats.data.messages], [A.openReports, stats.data.open_reports]]
    : [];

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 pt-4 md:pt-10">
      <h1 className="px-1 text-4xl font-extrabold tracking-tight">{A.title}</h1>
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label={A.stats}>
        {stats.isLoading
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-3xl" />)
          : cards.map(([label, v]) => (
              <div key={label as string} className="glass rounded-3xl p-5">
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="mt-2 text-3xl font-extrabold tabular-nums">{v}</p>
              </div>
            ))}
      </section>
      {stats.data && (
        <section className="glass rounded-3xl p-5">
          <h2 className="text-sm font-semibold text-muted-foreground">{A.perDay}</h2>
          <div className="mt-4 h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.data.per_day}>
                <XAxis dataKey="day" tickFormatter={(d) => format(new Date(d), "d MMM")} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: "var(--accent)" }} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--popover-foreground)" }} />
                <Bar dataKey="count" fill="var(--chart-1)" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      <Tabs defaultValue="reports">
        <TabsList className="h-12 rounded-2xl p-1">
          <TabsTrigger value="reports" className="h-10 rounded-xl px-4">{A.reports}</TabsTrigger>
          <TabsTrigger value="users" className="h-10 rounded-xl px-4">{A.accounts}</TabsTrigger>
          <TabsTrigger value="contact" className="h-10 rounded-xl px-4">{A.contact}</TabsTrigger>
        </TabsList>
        <TabsContent value="reports"><Reports /></TabsContent>
        <TabsContent value="users"><Users /></TabsContent>
        <TabsContent value="contact"><Contact /></TabsContent>
      </Tabs>
    </main>
  );
}

function Reports() {
  const A = t.admin;
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["admin", "reports"],
    queryFn: async () => {
      const { data, error } = await supabase.from("messages").select("id, body, created_at, report_count, reviewed, hidden").gt("report_count", 0).order("reviewed").order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return data;
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin"] });
  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("messages").delete().eq("id", id); if (error) throw error; },
    onSuccess: refresh, onError: () => toast.error(t.common.somethingWrong),
  });
  const restore = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.rpc("admin_review_message", { _message_id: id, _restore: true }); if (error) throw error; },
    onSuccess: refresh, onError: () => toast.error(t.common.somethingWrong),
  });
  if (q.isLoading) return <Skeleton className="mt-4 h-32 rounded-3xl" />;
  if (!q.data?.length) return <p className="glass mt-4 rounded-3xl p-8 text-center text-muted-foreground">{A.noReports}</p>;
  return (
    <ul className="mt-4 space-y-3">
      {q.data.map((m) => (
        <li key={m.id} className="glass rounded-3xl p-5">
          <p className="whitespace-pre-wrap break-words">{m.body}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {A.reportsCount(m.report_count)} · {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}{m.reviewed ? ` · ${A.reviewed}` : ""}
          </p>
          <div className="mt-4 flex gap-2">
            <Button size="sm" variant="destructive" onClick={() => del.mutate(m.id)}>{A.deleteMsg}</Button>
            {m.hidden && <Button size="sm" variant="secondary" onClick={() => restore.mutate(m.id)}>{A.restore}</Button>}
          </div>
        </li>
      ))}
    </ul>
  );
}

function Users() {
  const A = t.admin;
  const [search, setSearch] = useState("");
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["admin", "users", search],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_users", { _search: search });
      if (error) throw error;
      return data;
    },
  });
  const toggle = useMutation({
    mutationFn: async ({ id, suspended }: { id: string; suspended: boolean }) => {
      const { error } = await supabase.rpc("admin_set_suspended", { _user_id: id, _suspended: suspended });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "users"] }),
    onError: () => toast.error(t.common.somethingWrong),
  });
  return (
    <div className="mt-4 space-y-3">
      <Input placeholder={A.search} aria-label={A.search} className="h-12 rounded-2xl" value={search} onChange={(e) => setSearch(e.target.value)} />
      <ul className="space-y-2">
        {q.data?.map((u) => (
          <li key={u.id} className="glass flex items-center justify-between gap-3 rounded-2xl p-4">
            <div className="min-w-0">
              <p className="truncate font-semibold">{u.username ? `@${u.username}` : "—"} {u.display_name && <span className="font-normal text-muted-foreground">· {u.display_name}</span>}</p>
              <p className="truncate text-xs text-muted-foreground">{u.email}</p>
            </div>
            <Button size="sm" variant={u.suspended ? "secondary" : "destructive"} onClick={() => toggle.mutate({ id: u.id, suspended: !u.suspended })}>
              {u.suspended ? A.unsuspend : A.suspend}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Contact() {
  const A = t.admin;
  const q = useQuery({
    queryKey: ["admin", "contact"],
    queryFn: async () => {
      const { data, error } = await supabase.from("contact_messages").select("*").order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return data;
    },
  });
  if (q.isLoading) return <Skeleton className="mt-4 h-32 rounded-3xl" />;
  if (!q.data?.length) return <p className="glass mt-4 rounded-3xl p-8 text-center text-muted-foreground">{A.noContact}</p>;
  return (
    <ul className="mt-4 space-y-3">
      {q.data.map((c) => (
        <li key={c.id} className="glass rounded-3xl p-5">
          <p className="font-semibold">{c.name} <span className="font-normal text-muted-foreground">· {c.email}</span></p>
          <p className="mt-2 whitespace-pre-wrap break-words text-muted-foreground">{c.body}</p>
          <p className="mt-2 text-xs text-muted-foreground">{formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}</p>
        </li>
      ))}
    </ul>
  );
}
