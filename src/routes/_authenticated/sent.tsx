import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Send as SendIcon, XCircle } from "lucide-react";
import { useState } from "react";
import { t, timeAgo } from "@/i18n";
import { replyAsMember } from "@/lib/replies.functions";
import { MessageTabs } from "@/components/site/message-tabs";
import { AnswerNotice } from "@/components/site/answer-notice";
import { ReplyBox, ThreadBubbles } from "@/components/site/thread";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { live, LIVE_MS } from "@/lib/live";
import { sentThreadQuery, SENT_KEY, useSeenWhenShown, useSentMessages, type SentItem } from "@/lib/inbox-data";
import { SHEET_CLASS } from "@/components/site/sheet";

export const Route = createFileRoute("/_authenticated/sent")({
  head: () => ({ meta: [{ title: t.sent.metaTitle }, { name: "description", content: t.sent.metaDesc }, { name: "robots", content: "noindex" }] }),
  component: SentPage,
});

type State = "waiting" | "delivered" | "seen" | "not_delivered";
type Item = SentItem;
const KEY = SENT_KEY;

// Signed-in students see what they sent, how far it got and any replies. my_sent_messages() only
// returns rows tied to their own account; the recipient never learns who sent a message.
function SentPage() {
  const S = t.sent;
  const TH = t.thread;
  const qc = useQueryClient();
  const reply = useServerFn(replyAsMember);
  const [open, setOpen] = useState<Item | null>(null);

  const list = useSentMessages(LIVE_MS);

  const messageId = open?.message_id ?? null;
  // The latest version of the open item (the list refreshes every 30 s), e.g. a new public answer.
  const current = (messageId && list.data?.find((x) => x.message_id === messageId)) || open;
  const thread = useQuery({ ...sentThreadQuery(messageId ?? ""), enabled: !!messageId, ...live });
  // Clears the red "new reply" mark once the fresh conversation is on screen (also when a reply
  // arrives while it is open).
  useSeenWhenShown("sent", messageId, !!messageId && !!list.data?.some((x) => x.message_id === messageId && x.new_reply));
  const rows = thread.data ?? [];

  const label = (s: string) => S.state[(s in S.state ? s : "waiting") as State];

  return (
    <main className="mx-auto max-w-2xl px-4 pt-4 md:pt-10">
      <MessageTabs />
      <h1 className="px-1 text-4xl font-extrabold tracking-tight">{S.title}</h1>
      <p className="mt-1 px-1 text-sm text-muted-foreground">{S.note}</p>

      <div className="mt-6 space-y-3">
        {list.isLoading &&
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="glass max-w-[34rem] rounded-[32px] p-5">
              <Skeleton className="h-4 w-3/4 rounded-full" />
              <Skeleton className="mt-3 h-4 w-1/2 rounded-full" />
            </div>
          ))}

        {list.isError && <p className="rounded-2xl bg-destructive/10 p-4 text-sm text-destructive" role="alert">{t.common.somethingWrong}</p>}

        {list.data && list.data.length === 0 && (
          <div className="glass animate-rise rounded-[32px] px-6 py-14 text-center">
            <div className="animate-floaty mx-auto grid size-16 place-items-center rounded-2xl bg-accent text-primary"><SendIcon className="size-7" /></div>
            <p className="mx-auto mt-6 max-w-sm text-muted-foreground">{S.empty}</p>
          </div>
        )}

        <ul className="space-y-3">
          {list.data?.map((m, i) => (
            <li key={`${m.message_id ?? "gone"}-${m.sent_at}-${i}`} className="animate-rise" style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}>
              <Button
                variant="ghost"
                type="button"
                onClick={() => setOpen(m)}
                className="glass press relative block h-auto w-full max-w-[34rem] whitespace-normal rounded-[26px_26px_8px_26px] px-5 py-4 text-left hover:bg-accent/60"
              >
                {m.new_reply && <span className="absolute right-3 top-3 size-3 rounded-full bg-destructive" aria-hidden />}
                <span className="block min-w-0">
                  <span className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-muted-foreground">
                    <span>{m.to_name ? S.to(m.to_name) : S.toUnknown} · {timeAgo(m.sent_at)}</span>
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", m.state === "not_delivered" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground")}>{label(m.state)}</span>
                    {m.new_reply ? (
                      <span className="rounded-full bg-destructive px-2 py-0.5 text-[11px] font-bold text-destructive-foreground">{S.newReply}</span>
                    ) : m.awaiting_you ? (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">{S.yourTurn}</span>
                    ) : m.reply_count > 0 ? (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">{S.replies(m.reply_count)}</span>
                    ) : null}
                    {m.answer && <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-accent-foreground">{t.answerNotice.chip}</span>}
                  </span>
                  <span className="line-clamp-2 break-words text-[17px] font-medium leading-snug [overflow-wrap:anywhere]">{m.body ?? S.gone}</span>
                </span>
              </Button>
            </li>
          ))}
        </ul>
      </div>

      <Dialog open={!!open} onOpenChange={(o) => { if (!o) setOpen(null); }}>
        <DialogContent className={cn("max-h-[88dvh] overflow-y-auto bg-popover md:w-[calc(100%-2rem)] md:max-w-lg md:rounded-[28px]", SHEET_CLASS)}>
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold text-muted-foreground">
              {open?.to_name ? S.to(open.to_name) : S.toUnknown} · {open && timeAgo(open.sent_at)}
            </DialogTitle>
            <DialogDescription className="sr-only">{S.title}</DialogDescription>
          </DialogHeader>
          {open && (
            <div className="space-y-4">
              {open.body ? (
                <p className="whitespace-pre-wrap break-words rounded-[22px] bg-field p-[18px] text-[17px] leading-relaxed [overflow-wrap:anywhere]">{open.body}</p>
              ) : (
                <p className="rounded-[22px] bg-muted p-[18px] text-sm text-muted-foreground">{S.gone}</p>
              )}
              <p className="text-sm font-semibold">{label(open.state)}</p>
              {open.state === "not_delivered" && (
                <div className="flex items-start gap-3 rounded-2xl bg-destructive/10 p-4 text-sm text-destructive" role="status">
                  <XCircle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
                  <p>{S.notDeliveredBody}</p>
                </div>
              )}
              {current?.answer && <AnswerNotice answer={current.answer} answeredAt={current.answered_at} username={current.to_username} />}
              {messageId && (open.state === "delivered" || open.state === "seen") && (
                <section aria-label={TH.title}>
                  {thread.isLoading ? (
                    <Skeleton className="h-16 rounded-2xl" />
                  ) : rows.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{TH.noReplyYet}</p>
                  ) : (
                    <div className="space-y-4">
                      <ThreadBubbles rows={rows} viewer="sender" />
                      {rows[0]?.closed ? (
                        <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground" role="status">{TH.closed}</p>
                      ) : rows[0]?.can_reply ? (
                        <ReplyBox
                          placeholder={TH.placeholder}
                          sendLabel={TH.send}
                          onSubmit={(body) => reply({ data: { messageId, body } })}
                          onDone={() => {
                            qc.invalidateQueries({ queryKey: ["sent-thread", messageId] });
                            qc.invalidateQueries({ queryKey: KEY });
                          }}
                        />
                      ) : (
                        <p className="text-sm text-muted-foreground" role="status">{TH.waiting}</p>
                      )}
                      <p className="text-xs text-muted-foreground">{TH.privateNote}</p>
                    </div>
                  )}
                </section>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
