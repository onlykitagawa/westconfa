import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { useState } from "react";
import { toast } from "sonner";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { t } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { adminRemoveAvatar } from "@/lib/avatar.functions";
import { UserAvatar } from "@/components/site/avatar";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: t.admin.metaTitle }, { name: "description", content: t.admin.metaDesc }, { property: "og:title", content: t.admin.metaTitle }, { property: "og:description", content: t.admin.metaDesc }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: AdminPage,
});

type Stats = { users: number; active_links: number; messages: number; open_reports: number; pending_review?: number; per_day: { day: string; count: number }[] };

// Moderation screen text. Admin-only and English-only, so it lives here for now.
const N = {
  review: "Needs review",
  nothingWaiting: "Nothing waiting for review.",
  approve: "Approve",
  reject: "Reject",
  rejectTitle: "Reject this message?",
  rejectBody: "It will be permanently deleted and will never reach the recipient.",
  approved: "Approved. The message was delivered.",
  rejected: "Rejected. The message was deleted.",
  reviewAll: "Review every message",
  reviewAllHint: "When on, every new message waits here until you approve it. Clearly harmful messages are still blocked.",
  reviewAllOn: "Every new message now waits for your review.",
  reviewAllOff: "New messages are delivered after the AI check.",
  paused: "AI screening is paused, so every new message is waiting for review.",
  resume: "Resume AI screening",
  resumed: "AI screening resumed.",
  unknownSender: "Unknown (sent before sender records existed)",
  source: { ai: "Flagged by AI", review_all: "Review-all mode", ai_error: "AI unavailable" } as Record<string, string>,
  others: (n: number) => `${n} other message${n === 1 ? "" : "s"} from this sender in the last 90 days`,
};

type Details = {
  message_id: string;
  recipient_username: string | null;
  recipient_display_name: string | null;
  sender_kind: string;
  sender_username: string | null;
  sender_email: string | null;
  sender_network_code: string | null;
  sender_other_messages: number | null;
};

// Who sent it and to whom. Only the admin screen ever calls this (admins only, held or reported messages only).
function useDetails(ids: string[]) {
  return useQuery({
    queryKey: ["admin", "details", ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_message_details", { _message_ids: ids });
      if (error) throw error;
      const byId = new Map<string, Details>();
      for (const d of (data ?? []) as unknown as Details[]) byId.set(d.message_id, d);
      return byId;
    },
  });
}

function WhoLine({ d }: { d: Details | undefined }) {
  if (!d) return null;
  const to = `@${d.recipient_username ?? "?"}${d.recipient_display_name ? ` (${d.recipient_display_name})` : ""}`;
  let from: string;
  if (d.sender_kind === "account") {
    from = `${d.sender_username ? `@${d.sender_username}` : "Account"}${d.sender_email ? ` (${d.sender_email})` : ""}`;
  } else if (d.sender_kind === "guest") {
    from = `Guest, network code ${d.sender_network_code ?? "?"}`;
  } else {
    from = N.unknownSender;
  }
  const others = d.sender_other_messages ?? 0;
  return (
    <div className="mt-3 space-y-0.5 rounded-2xl bg-muted/60 p-3 text-xs [overflow-wrap:anywhere]">
      <p><span className="font-semibold">To:</span> {to}</p>
      <p><span className="font-semibold">From:</span> {from}</p>
      {others > 0 && <p className="text-muted-foreground">{N.others(others)}</p>}
    </div>
  );
}

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

// Held replies, held public answers and reported public answers, with the text they answer.
function useReviewQueue() {
  return useQuery({
    queryKey: ["admin", "queue"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_review_queue");
      if (error) throw error;
      return data ?? [];
    },
  });
}

function RepliesQueue() {
  const A = t.admin;
  const qc = useQueryClient();
  const list = useReviewQueue();
  const decide = useMutation({
    mutationFn: async (v: { kind: string; id: string; approve: boolean }) => {
      const { error } = v.kind.startsWith("reply_")
        ? await supabase.rpc("admin_decide_reply", { _id: v.id, _approve: v.approve })
        : await supabase.rpc("admin_decide_answer", { _id: v.id, _approve: v.approve });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(v.approve ? N.approved : N.rejected);
      qc.invalidateQueries({ queryKey: ["admin", "queue"] });
    },
    onError: () => toast.error(t.common.somethingWrong),
  });
  const label: Record<string, string> = {
    reply_sender: A.kindReplySender, reply_owner: A.kindReplyOwner, answer_pending: A.kindAnswerPending, answer_reported: A.kindAnswerReported,
  };
  const items = list.data ?? [];
  return (
    <div className="mt-4 space-y-3">
      {list.isLoading ? (
        <Skeleton className="h-32 rounded-3xl" />
      ) : items.length === 0 ? (
        <p className="glass rounded-3xl p-8 text-center text-muted-foreground">{A.noReplies}</p>
      ) : (
        <ul className="space-y-3">
          {items.map((it) => (
            <li key={`${it.kind}-${it.id}`} className="glass rounded-3xl p-5">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-accent px-2.5 py-1 font-semibold text-accent-foreground">{label[it.kind] ?? it.kind}</span>
                {it.reports > 0 && <span className="rounded-full bg-muted px-2.5 py-1 font-semibold">{A.reportsCount(it.reports)}</span>}
                <span className="text-muted-foreground">{formatDistanceToNow(new Date(it.created_at), { addSuffix: true })}</span>
              </div>
              <p className="mt-3 whitespace-pre-wrap break-words text-[17px] [overflow-wrap:anywhere]">{it.body}</p>
              <p className="mt-3 text-xs font-semibold text-muted-foreground">{A.context}</p>
              <p className="mt-1 whitespace-pre-wrap break-words rounded-2xl bg-field p-3 text-sm text-muted-foreground [overflow-wrap:anywhere]">{it.context}</p>
              {it.reason && <p className="mt-2 text-sm text-muted-foreground [overflow-wrap:anywhere]">{it.reason}</p>}
              <div className="mt-4 flex gap-2">
                <Button size="sm" variant="hero" disabled={decide.isPending} onClick={() => decide.mutate({ kind: it.kind, id: it.id, approve: true })}>{A.approve}</Button>
                <Button size="sm" variant="destructive" disabled={decide.isPending} onClick={() => decide.mutate({ kind: it.kind, id: it.id, approve: false })}>{N.reject}</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
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
  const pending = stats.data?.pending_review ?? 0;
  const queueCount = useReviewQueue().data?.length ?? 0;
  const cards: { label: string; value: number; hot?: boolean; wide?: boolean }[] = stats.data
    ? [
        { label: A.users, value: stats.data.users },
        { label: A.links, value: stats.data.active_links },
        { label: A.messages, value: stats.data.messages },
        { label: A.openReports, value: stats.data.open_reports },
        { label: N.review, value: pending, hot: pending > 0, wide: true },
      ]
    : [];

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 pt-4 md:pt-10">
      <h1 className="px-1 text-4xl font-extrabold tracking-tight">{A.title}</h1>
      <section className="grid grid-cols-2 gap-3 md:grid-cols-5" aria-label={A.stats}>
        {stats.isLoading
          ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className={cn("h-28 rounded-3xl", i === 4 && "col-span-2 md:col-span-1")} />)
          : cards.map((c) => (
              <div key={c.label} className={cn("glass rounded-3xl p-5", c.wide && "col-span-2 md:col-span-1", c.hot && "ring-2 ring-primary/50")}>
                <p className="text-sm text-muted-foreground">{c.label}</p>
                <p className="mt-2 text-3xl font-extrabold tabular-nums">{c.value}</p>
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

      <Tabs defaultValue="review">
        <TabsList className="h-12 w-full justify-start overflow-x-auto rounded-2xl p-1">
          <TabsTrigger value="review" className="h-10 shrink-0 rounded-xl px-4">
            {N.review}
            {pending > 0 && <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">{pending}</span>}
          </TabsTrigger>
          <TabsTrigger value="reports" className="h-10 shrink-0 rounded-xl px-4">{A.reports}</TabsTrigger>
          <TabsTrigger value="replies" className="h-10 shrink-0 rounded-xl px-4">
            {A.replies}
            {queueCount > 0 && <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">{queueCount}</span>}
          </TabsTrigger>
          <TabsTrigger value="users" className="h-10 shrink-0 rounded-xl px-4">{A.accounts}</TabsTrigger>
          <TabsTrigger value="contact" className="h-10 shrink-0 rounded-xl px-4">{A.contact}</TabsTrigger>
        </TabsList>
        <TabsContent value="review"><NeedsReview /></TabsContent>
        <TabsContent value="reports"><Reports /></TabsContent>
        <TabsContent value="replies"><RepliesQueue /></TabsContent>
        <TabsContent value="users"><Users /></TabsContent>
        <TabsContent value="contact"><Contact /></TabsContent>
      </Tabs>
    </main>
  );
}

type PendingRow = { id: string; body: string; created_at: string };
type Mod = { message_id: string; category: string | null; reason: string | null; source: string };
type PendingItem = PendingRow & { mod: Mod | null };

function ModerationSettings() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["admin", "settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("app_settings").select("key, value").in("key", ["review_all_messages", "ai_moderation_paused"]);
      if (error) throw error;
      const values = new Map<string, unknown>();
      for (const r of data ?? []) values.set(r.key, r.value);
      // The server treats anything other than an explicit false as "on".
      return { reviewAll: values.get("review_all_messages") !== false, paused: values.get("ai_moderation_paused") !== false };
    },
  });
  const save = useMutation({
    mutationFn: async (v: { key: string; value: boolean }) => {
      const { error } = await supabase.from("app_settings").update({ value: v.value }).eq("key", v.key);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["admin", "settings"] });
      toast.success(v.key === "ai_moderation_paused" ? N.resumed : v.value ? N.reviewAllOn : N.reviewAllOff);
    },
    onError: () => toast.error(t.common.somethingWrong),
  });
  if (q.isLoading) return <Skeleton className="h-24 rounded-3xl" />;
  if (!q.data) return null;
  return (
    <div className="space-y-3">
      {q.data.paused && (
        <div role="alert" className="flex flex-col gap-3 rounded-3xl bg-destructive/10 p-5 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
          <p className="font-medium">{N.paused}</p>
          <Button size="sm" variant="destructive" disabled={save.isPending} onClick={() => save.mutate({ key: "ai_moderation_paused", value: false })}>{N.resume}</Button>
        </div>
      )}
      <div className="glass flex items-start justify-between gap-4 rounded-3xl p-5">
        <div className="min-w-0">
          <label htmlFor="review-all" className="font-semibold">{N.reviewAll}</label>
          <p className="mt-1 text-sm text-muted-foreground">{N.reviewAllHint}</p>
        </div>
        <Switch id="review-all" checked={q.data.reviewAll} disabled={save.isPending} onCheckedChange={(v: boolean) => save.mutate({ key: "review_all_messages", value: v })} />
      </div>
    </div>
  );
}

function NeedsReview() {
  const qc = useQueryClient();
  const [rejectId, setRejectId] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ["admin", "pending"],
    queryFn: async (): Promise<PendingItem[]> => {
      const { data, error } = await supabase.from("messages").select("id, body, created_at").eq("status", "pending").order("created_at", { ascending: true }).limit(200);
      if (error) throw error;
      const rows = (data ?? []) as PendingRow[];
      const byId = new Map<string, Mod>();
      if (rows.length) {
        const { data: mods, error: modError } = await supabase.from("message_moderation").select("message_id, category, reason, source").in("message_id", rows.map((r) => r.id));
        if (modError) throw modError;
        for (const m of (mods ?? []) as Mod[]) byId.set(m.message_id, m);
      }
      return rows.map((r) => ({ ...r, mod: byId.get(r.id) ?? null }));
    },
  });
  const items = list.data ?? [];
  const details = useDetails(items.map((m) => m.id));
  const decide = useMutation({
    mutationFn: async (v: { id: string; approve: boolean }) => {
      const { error } = await supabase.rpc("admin_decide_message", { _message_id: v.id, _approve: v.approve });
      if (error) throw error;
    },
    onMutate: (v) => {
      qc.setQueryData<PendingItem[]>(["admin", "pending"], (old) => (old ?? []).filter((m) => m.id !== v.id));
    },
    onSuccess: (_d, v) => {
      toast.success(v.approve ? N.approved : N.rejected);
      qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: () => {
      toast.error(t.common.somethingWrong);
      qc.invalidateQueries({ queryKey: ["admin"] });
    },
  });

  return (
    <div className="mt-4 space-y-4">
      <ModerationSettings />
      {list.isLoading ? (
        <Skeleton className="h-32 rounded-3xl" />
      ) : items.length === 0 ? (
        <p className="glass rounded-3xl p-8 text-center text-muted-foreground">{N.nothingWaiting}</p>
      ) : (
        <ul className="space-y-3">
          {items.map((m) => {
            const cat = m.mod?.category && m.mod.category !== "none" ? m.mod.category.replace(/_/g, " ") : null;
            return (
              <li key={m.id} className="glass rounded-3xl p-5">
                <p className="whitespace-pre-wrap break-words text-[17px] [overflow-wrap:anywhere]">{m.body}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  {m.mod && <span className="rounded-full bg-accent px-2.5 py-1 font-semibold text-accent-foreground">{N.source[m.mod.source] ?? m.mod.source}</span>}
                  {cat && <span className="rounded-full bg-muted px-2.5 py-1 font-semibold capitalize">{cat}</span>}
                  <span className="text-muted-foreground">{formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}</span>
                </div>
                {m.mod?.reason && <p className="mt-2 text-sm text-muted-foreground [overflow-wrap:anywhere]">{m.mod.reason}</p>}
                <WhoLine d={details.data?.get(m.id)} />
                <div className="mt-4 flex gap-2">
                  <Button size="sm" variant="hero" disabled={decide.isPending} onClick={() => decide.mutate({ id: m.id, approve: true })}>{N.approve}</Button>
                  <Button size="sm" variant="destructive" disabled={decide.isPending} onClick={() => setRejectId(m.id)}>{N.reject}</Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <AlertDialog open={!!rejectId} onOpenChange={(o) => { if (!o) setRejectId(null); }}>
        <AlertDialogContent className="rounded-[28px] bg-popover">
          <AlertDialogHeader>
            <AlertDialogTitle>{N.rejectTitle}</AlertDialogTitle>
            <AlertDialogDescription>{N.rejectBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-12 rounded-2xl">{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              className="h-12 rounded-2xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (rejectId) decide.mutate({ id: rejectId, approve: false });
                setRejectId(null);
              }}
            >
              {N.reject}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
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
  const details = useDetails(q.data?.map((m) => m.id) ?? []);
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
          <WhoLine d={details.data?.get(m.id)} />
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
  const clearPhoto = useServerFn(adminRemoveAvatar);
  const dropPhoto = useMutation({
    mutationFn: async (userId: string) => {
      const res = await clearPhoto({ data: { userId } });
      if (!res.ok) throw new Error(res.code);
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
            <UserAvatar url={u.avatar_url} name={u.display_name || u.username || "?"} className="size-10 text-base" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{u.username ? `@${u.username}` : "—"} {u.display_name && <span className="font-normal text-muted-foreground">· {u.display_name}</span>}</p>
              <p className="truncate text-xs text-muted-foreground">{u.email}</p>
            </div>
            <div className="flex shrink-0 flex-col gap-1.5 sm:flex-row">
              {u.avatar_url && <Button size="sm" variant="secondary" onClick={() => dropPhoto.mutate(u.id)}>{A.removePhoto}</Button>}
              <Button size="sm" variant={u.suspended ? "secondary" : "destructive"} onClick={() => toggle.mutate({ id: u.id, suspended: !u.suspended })}>
                {u.suspended ? A.unsuspend : A.suspend}
              </Button>
            </div>
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
