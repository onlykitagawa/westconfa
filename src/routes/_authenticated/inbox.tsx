import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { CheckCheck, Flag, Globe, Inbox as InboxIcon, Lock, LockOpen, MoreHorizontal, Reply, Share2, Trash2 } from "lucide-react";
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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { LinkBar, ShareDialog } from "@/components/site/share-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MessageTabs } from "@/components/site/message-tabs";
import { cn } from "@/lib/utils";
import { INBOX_KEY, REPLIES_KEY, threadStates, useInboxMessages, useInboxReplies, type InboxMsg } from "@/lib/inbox-data";
import { SHEET_CLASS } from "@/components/site/sheet";

export const Route = createFileRoute("/_authenticated/inbox")({
  head: () => ({ meta: [{ title: t.inbox.metaTitle }, { name: "description", content: t.inbox.metaDesc }, { property: "og:title", content: t.inbox.metaTitle }, { property: "og:description", content: t.inbox.metaDesc }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: InboxPage,
});

type Msg = InboxMsg;
const KEY = INBOX_KEY;

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

  const { data, isLoading } = useInboxMessages();
  // One light query for the list labels (no text), one full query for the open conversation.
  const summary = useInboxReplies();
  const threadState = useMemo(() => threadStates(summary.data), [summary.data]);
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
  const markAllRead = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("messages").update({ read_at: new Date().toISOString() }).eq("recipient_id", profile?.id ?? "").eq("status", "approved").is("read_at", null);
      if (error) throw error;
    },
    onMutate: () => optimistic((l) => l.map((m) => (m.read_at ? m : { ...m, read_at: new Date().toISOString() }))),
    onError: () => { toast.error(t.common.somethingWrong); qc.invalidateQueries({ queryKey: KEY }); },
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
          <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
            {data ? I.unread(unread) : "\u00a0"}
            {unread > 0 && (
              <button type="button" onClick={() => markAllRead.mutate()} disabled={markAllRead.isPending} className="inline-flex items-center gap-1 rounded-full px-2 py-1 font-semibold text-foreground hover:bg-accent">
                <CheckCheck className="size-4" aria-hidden="true" /> {I.markAllRead}
              </button>
            )}
          </p>
        </div>
        <Button variant="hero" className="h-11 px-5" onClick={() => setShareOpen(true)} disabled={!profile?.username}>
          <Share2 /> <span className="hidden sm:inline">{I.shareLink}</span><span className="sm:hidden">{t.common.share}</span>
        </Button>
      </div>

      {profile?.username && <LinkBar username={profile.username} />}

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
        <DialogContent className={cn("max-h-[88dvh] overflow-y-auto bg-popover md:w-[calc(100%-2rem)] md:max-w-lg md:rounded-[28px]", SHEET_CLASS)}>
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
              <div className="grid grid-cols-[1fr_auto] gap-2">
                {!openMsg?.replies_closed && <Button variant="hero" className="col-span-2 h-12 w-full" onClick={() => setMode("reply")}><Reply /> {I.reply}</Button>}
                <Button variant="secondary" className="h-12 w-full" onClick={() => setMode("answer")}><Globe /> {I.answer}</Button>
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <Button variant="secondary" className="size-12 rounded-2xl p-0" aria-label={I.more}><MoreHorizontal /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 rounded-2xl p-1.5">
                    {!!thread.data?.length && openMsg && (
                      <>
                        <DropdownMenuItem className="min-h-11 rounded-xl" disabled={setClosed.isPending} onSelect={() => setClosed.mutate({ id: openMsg.id, closed: !openMsg.replies_closed })}>
                          {openMsg.replies_closed ? <LockOpen /> : <Lock />} {openMsg.replies_closed ? I.reopenThread : I.closeThread}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                      </>
                    )}
                    <DropdownMenuItem className="min-h-11 rounded-xl" onSelect={() => setConfirm("report")}><Flag /> {I.report}</DropdownMenuItem>
                    <DropdownMenuItem className="min-h-11 rounded-xl text-destructive focus:text-destructive" onSelect={() => setConfirm("delete")}><Trash2 /> {I.delete}</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
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
