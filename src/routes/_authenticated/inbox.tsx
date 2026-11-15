import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Flag, Globe, Inbox as InboxIcon, Reply, Share2, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { t } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { answerPublicly, replyToMessage } from "@/lib/replies.functions";
import { ReplyBox, ThreadBubbles } from "@/components/site/thread";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ShareDialog } from "@/components/site/share-dialog";
import { MessageTabs } from "@/components/site/message-tabs";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/inbox")({
  head: () => ({ meta: [{ title: t.inbox.metaTitle }, { name: "description", content: t.inbox.metaDesc }, { property: "og:title", content: t.inbox.metaTitle }, { property: "og:description", content: t.inbox.metaDesc }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: InboxPage,
});

type Msg = { id: string; body: string; created_at: string; read_at: string | null; replies_closed: boolean };
const KEY = ["inbox"];
const REPLIES_KEY = ["inbox-replies"];

function InboxPage() {
  const I = t.inbox;
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [shareOpen, setShareOpen] = useState(false);
  const [openMsg, setOpenMsg] = useState<Msg | null>(null);
  const [confirm, setConfirm] = useState<null | "delete" | "report">(null);
  const [mode, setMode] = useState<"view" | "reply" | "answer">("view");
  const reply = useServerFn(replyToMessage);
  const answer = useServerFn(answerPublicly);

  const { data, isLoading } = useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error } = await supabase.from("messages").select("id, body, created_at, read_at, replies_closed").eq("recipient_id", profile?.id ?? "00000000-0000-0000-0000-000000000000").eq("status", "approved").eq("hidden", false).order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return data as Msg[];
    },
    refetchOnWindowFocus: true,
  });

  // One light query for the list badges (no text), one full query for the open conversation.
  const summary = useQuery({
    queryKey: REPLIES_KEY,
    enabled: !!profile?.id,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase.from("message_replies").select("message_id, author, status").order("created_at", { ascending: true }).limit(1000);
      if (error) throw error;
      return data ?? [];
    },
  });
  const threadState = useMemo(() => {
    const map = new Map<string, { replied: boolean; waiting: boolean }>();
    for (const r of summary.data ?? []) {
      const cur = map.get(r.message_id) ?? { replied: false, waiting: false };
      if (r.author === "owner") cur.replied = true;
      if (r.status === "approved") cur.waiting = r.author === "sender";
      map.set(r.message_id, cur);
    }
    return map;
  }, [summary.data]);
  const thread = useQuery({
    queryKey: ["inbox-thread", openMsg?.id],
    enabled: !!openMsg,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase.from("message_replies").select("id, author, body, created_at, status").eq("message_id", openMsg!.id).order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
  const setClosed = useMutation({
    mutationFn: async (v: { id: string; closed: boolean }) => {
      const { error } = await supabase.rpc("set_thread_closed", { _message_id: v.id, _closed: v.closed });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      optimistic((l) => l.map((m) => (m.id === v.id ? { ...m, replies_closed: v.closed } : m)));
      setOpenMsg((m) => (m && m.id === v.id ? { ...m, replies_closed: v.closed } : m));
    },
    onError: () => toast.error(t.common.somethingWrong),
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
    setMode("view");
    if (!m.read_at) markRead.mutate(m.id);
  };
  const unread = data?.filter((m) => !m.read_at).length ?? 0;

  return (
    <main className="mx-auto max-w-2xl px-4 pt-4 md:pt-10">
      <MessageTabs />
      <div className="flex items-end justify-between gap-4 px-1">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight">{I.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground" aria-live="polite">{data ? I.unread(unread) : "\u00a0"}</p>
        </div>
        <Button variant="hero" className="h-11 px-5" onClick={() => setShareOpen(true)} disabled={!profile?.username}>
          <Share2 /> <span className="hidden sm:inline">{I.shareLink}</span><span className="sm:hidden">{t.common.share}</span>
        </Button>
      </div>

      {profile?.suspended && <p className="mt-6 rounded-2xl bg-destructive/10 p-4 text-sm text-destructive">{I.suspended}</p>}
      {profile?.inbox_paused && !profile.suspended && <p className="mt-6 rounded-2xl bg-accent p-4 text-sm text-accent-foreground">{I.paused}</p>}

      <div className="mt-6 space-y-3">
        {isLoading &&
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="glass max-w-[34rem] rounded-[32px] p-5">
              <Skeleton className="h-4 w-3/4 rounded-full" />
              <Skeleton className="mt-3 h-4 w-1/2 rounded-full" />
            </div>
          ))}

        {data && data.length === 0 && (
          <div className="glass animate-rise rounded-[32px] px-6 py-14 text-center">
            <div className="animate-floaty mx-auto grid size-16 place-items-center rounded-2xl bg-accent text-primary"><InboxIcon className="size-7" /></div>
            <h2 className="mt-6 text-xl font-bold">{I.emptyTitle}</h2>
            <p className="mx-auto mt-2 max-w-sm text-muted-foreground">{I.emptyBody}</p>
            <Button variant="hero" className="mt-8" onClick={() => setShareOpen(true)}><Share2 /> {I.shareLink}</Button>
          </div>
        )}

        <ul className="space-y-3">
          {data?.map((m, i) => (
            <li key={m.id} className="animate-rise" style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}>
              <Button variant="ghost"
                type="button"
                onClick={() => open(m)}
                className={cn("glass press block h-auto w-full max-w-[34rem] whitespace-normal rounded-[26px_26px_26px_8px] px-5 py-4 text-left hover:bg-accent/60", m.read_at && "glass-read")}
              >
                <span className="block min-w-0">
                  <span className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                    {!m.read_at && <span className="size-2 shrink-0 rounded-full bg-coral" aria-hidden />}
                    <span>{I.anonymous} · {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}</span>
                    {threadState.get(m.id)?.waiting ? (
                      <span className="rounded-full bg-coral px-2 py-0.5 text-[11px] font-bold text-coral-foreground">{I.newReply}</span>
                    ) : threadState.get(m.id)?.replied ? (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">{I.replied}</span>
                    ) : null}
                  </span>
                  <span className={cn("line-clamp-2 break-words text-[17px] leading-snug [overflow-wrap:anywhere]", m.read_at ? "font-medium" : "font-bold")}>{m.body}</span>
                </span>
              </Button>
            </li>
          ))}
        </ul>
      </div>

      <Dialog open={!!openMsg} onOpenChange={(o) => { if (!o) { setOpenMsg(null); setMode("view"); } }}>
        <DialogContent className="max-h-[85dvh] w-[calc(100%-2rem)] overflow-y-auto rounded-[28px] bg-popover sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold text-muted-foreground">{I.anonymous} · {openMsg && formatDistanceToNow(new Date(openMsg.created_at), { addSuffix: true })}</DialogTitle>
            <DialogDescription className="sr-only">Message</DialogDescription>
          </DialogHeader>
          <p className="min-w-0 whitespace-pre-wrap break-words py-2 text-lg font-medium leading-relaxed [overflow-wrap:anywhere] sm:text-xl">{openMsg?.body}</p>
          {!!thread.data?.length && (
            <div className="border-t pt-4">
              <ThreadBubbles rows={thread.data} viewer="owner" />
            </div>
          )}
          {mode === "view" ? (
            <>
              {openMsg?.replies_closed && <p className="rounded-2xl bg-muted p-3 text-sm text-muted-foreground" role="status">{I.closedNote}</p>}
              <DialogFooter className="grid grid-cols-2 gap-2 sm:grid-cols-2 sm:space-x-0">
                {!openMsg?.replies_closed && <Button variant="hero" className="h-12 w-full" onClick={() => setMode("reply")}><Reply /> {I.reply}</Button>}
                <Button variant="secondary" className={cn("h-12 w-full", openMsg?.replies_closed && "col-span-2")} onClick={() => setMode("answer")}><Globe /> {I.answer}</Button>
                <Button variant="secondary" className="h-12 w-full" onClick={() => setConfirm("report")}><Flag /> {I.report}</Button>
                <Button variant="destructive" className="h-12 w-full" onClick={() => setConfirm("delete")}><Trash2 /> {I.delete}</Button>
              </DialogFooter>
              {!!thread.data?.length && openMsg && (
                <Button variant="ghost" className="w-full" disabled={setClosed.isPending} onClick={() => setClosed.mutate({ id: openMsg.id, closed: !openMsg.replies_closed })}>
                  {openMsg.replies_closed ? I.reopenThread : I.closeThread}
                </Button>
              )}
            </>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{mode === "reply" ? I.replyHint : I.answerHint}</p>
              <ReplyBox
                key={mode}
                autoFocus
                placeholder={mode === "reply" ? I.replyPlaceholder : I.answerPlaceholder}
                sendLabel={mode === "reply" ? I.replySend : I.answerSend}
                onSubmit={(body) => (mode === "reply" ? reply({ data: { messageId: openMsg!.id, body } }) : answer({ data: { messageId: openMsg!.id, answer: body } }))}
                onDone={(held) => {
                  if (mode === "reply") {
                    toast.success(held ? I.replyHeld : I.replySent);
                    qc.invalidateQueries({ queryKey: ["inbox-thread", openMsg?.id] });
                    qc.invalidateQueries({ queryKey: REPLIES_KEY });
                  } else {
                    toast.success(held ? I.answerHeld : I.answerPosted);
                    if (profile?.username) qc.invalidateQueries({ queryKey: ["answers", profile.username] });
                  }
                  setMode("view");
                }}
              />
              <Button variant="ghost" className="w-full" onClick={() => setMode("view")}>{I.back}</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent className="rounded-[28px] bg-popover">
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
