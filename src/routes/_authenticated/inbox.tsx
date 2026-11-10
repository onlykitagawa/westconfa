import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Check, Flag, Inbox as InboxIcon, Share2, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { t } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ShareDialog } from "@/components/site/share-dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/inbox")({
  head: () => ({ meta: [{ title: t.inbox.metaTitle }, { name: "description", content: t.inbox.metaDesc }, { property: "og:title", content: t.inbox.metaTitle }, { property: "og:description", content: t.inbox.metaDesc }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: InboxPage,
});

type Msg = { id: string; body: string; created_at: string; read_at: string | null };
const KEY = ["inbox"];

function InboxPage() {
  const I = t.inbox;
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [shareOpen, setShareOpen] = useState(false);
  const [openMsg, setOpenMsg] = useState<Msg | null>(null);
  const [confirm, setConfirm] = useState<null | "delete" | "report">(null);

  const { data, isLoading } = useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error } = await supabase.from("messages").select("id, body, created_at, read_at").order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return data as Msg[];
    },
    refetchOnWindowFocus: true,
  });

  const optimistic = (fn: (list: Msg[]) => Msg[]) => qc.setQueryData<Msg[]>(KEY, (old) => fn(old ?? []));

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("messages").update({ read_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onMutate: (id) => optimistic((l) => l.map((m) => (m.id === id ? { ...m, read_at: m.read_at ?? new Date().toISOString() } : m))),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("messages").delete().eq("id", id);
      if (error) throw error;
    },
    onMutate: (id) => optimistic((l) => l.filter((m) => m.id !== id)),
    onSuccess: () => toast.success(I.deleted),
    onError: () => { toast.error(t.common.somethingWrong); qc.invalidateQueries({ queryKey: KEY }); },
  });
  const report = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("report_message", { _message_id: id });
      if (error) throw error;
    },
    onMutate: (id) => optimistic((l) => l.filter((m) => m.id !== id)),
    onSuccess: () => toast.success(I.reported),
    onError: () => { toast.error(t.common.somethingWrong); qc.invalidateQueries({ queryKey: KEY }); },
  });

  const open = (m: Msg) => {
    setOpenMsg(m);
    if (!m.read_at) markRead.mutate(m.id);
  };
  const unread = data?.filter((m) => !m.read_at).length ?? 0;

  return (
    <main className="mx-auto max-w-2xl px-4 pt-4 md:pt-10">
      <div className="flex items-end justify-between gap-4 px-1">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight">{I.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground" aria-live="polite">{data ? I.unread(unread) : "\u00a0"}</p>
        </div>
        <Button variant="hero" onClick={() => setShareOpen(true)} disabled={!profile?.username}>
          <Share2 /> <span className="hidden sm:inline">{I.shareLink}</span><span className="sm:hidden">{t.common.share}</span>
        </Button>
      </div>

      {profile?.suspended && <p className="mt-6 rounded-2xl bg-destructive/10 p-4 text-sm text-destructive">{I.suspended}</p>}
      {profile?.inbox_paused && !profile.suspended && <p className="mt-6 rounded-2xl bg-accent p-4 text-sm text-accent-foreground">{I.paused}</p>}

      <div className="mt-6 space-y-3">
        {isLoading &&
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="glass rounded-3xl p-5">
              <Skeleton className="h-4 w-3/4 rounded-full" />
              <Skeleton className="mt-3 h-4 w-1/2 rounded-full" />
            </div>
          ))}

        {data && data.length === 0 && (
          <div className="glass animate-rise rounded-3xl px-6 py-14 text-center">
            <div className="animate-floaty mx-auto grid size-16 place-items-center rounded-2xl bg-accent text-primary"><InboxIcon className="size-7" /></div>
            <h2 className="mt-6 text-xl font-bold">{I.emptyTitle}</h2>
            <p className="mx-auto mt-2 max-w-sm text-muted-foreground">{I.emptyBody}</p>
            <Button variant="hero" className="mt-8" onClick={() => setShareOpen(true)}><Share2 /> {I.shareLink}</Button>
          </div>
        )}

        <ul className="space-y-3">
          {data?.map((m, i) => (
            <li key={m.id} className="animate-rise" style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}>
              <button
                type="button"
                onClick={() => open(m)}
                className="glass press flex w-full items-start gap-4 rounded-3xl p-5 text-left hover:bg-accent/60"
              >
                <span className={cn("mt-2 size-2.5 shrink-0 rounded-full", m.read_at ? "bg-transparent" : "bg-coral")} aria-label={m.read_at ? undefined : "Unread"} />
                <span className="min-w-0 flex-1">
                  <span className={cn("line-clamp-2 break-words", !m.read_at && "font-semibold")}>{m.body}</span>
                  <span className="mt-2 block text-xs text-muted-foreground">{formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <Dialog open={!!openMsg} onOpenChange={(o) => !o && setOpenMsg(null)}>
        <DialogContent className="rounded-3xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold text-muted-foreground">{I.anonymous} · {openMsg && formatDistanceToNow(new Date(openMsg.created_at), { addSuffix: true })}</DialogTitle>
            <DialogDescription className="sr-only">Message</DialogDescription>
          </DialogHeader>
          <p className="whitespace-pre-wrap break-words py-2 text-xl font-medium leading-relaxed">{openMsg?.body}</p>
          <DialogFooter className="grid grid-cols-3 gap-2 sm:grid-cols-3">
            <Button variant="secondary" onClick={() => openMsg && markRead.mutate(openMsg.id)} disabled={!!openMsg?.read_at}><Check /> {I.markRead}</Button>
            <Button variant="secondary" onClick={() => setConfirm("report")}><Flag /> {I.report}</Button>
            <Button variant="destructive" onClick={() => setConfirm("delete")}><Trash2 /> {I.delete}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm === "delete" ? I.deleteTitle : I.reportTitle}</AlertDialogTitle>
            <AlertDialogDescription>{confirm === "delete" ? I.deleteBody : I.reportBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-12 rounded-2xl">{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              className="h-12 rounded-2xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!openMsg) return;
                (confirm === "delete" ? remove : report).mutate(openMsg.id);
                setOpenMsg(null);
                setConfirm(null);
              }}
            >
              {confirm === "delete" ? I.delete : I.report}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {profile?.username && <ShareDialog open={shareOpen} onOpenChange={setShareOpen} username={profile.username} />}
    </main>
  );
}
