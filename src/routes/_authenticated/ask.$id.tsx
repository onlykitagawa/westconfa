import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Clock, Flag, MoreHorizontal, Send, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { t, timeAgo } from "@/i18n";
import { ASK_KEY, askAnswersQuery, askDelete, askMarkSeen, askPostQuery, askReport, type AskAnswer } from "@/lib/ask-data";
import { createAskAnswer } from "@/lib/ask.functions";
import { MAX_MESSAGE_LENGTH } from "@/lib/moderation";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { VoteButton } from "@/components/site/ask";
import { askErrorKey } from "@/lib/ask-rules";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/ask/$id")({
  head: () => ({ meta: [{ title: t.ask.metaTitle }, { name: "robots", content: "noindex" }] }),
  component: QuestionPage,
});

type Target = { kind: "post" | "answer"; id: string; action: "report" | "delete" };

function QuestionPage() {
  const A = t.ask;
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const post = useQuery(askPostQuery(id));
  const answers = useQuery({ ...askAnswersQuery(id), enabled: !!post.data });
  const [target, setTarget] = useState<Target | null>(null);

  // The author has now seen the answers: clear the red mark (only after they are on screen).
  const p = post.data;
  const lastAnswer = answers.data?.length ?? 0;
  useEffect(() => {
    if (p?.mine && p.status === "approved" && answers.isSuccess) void askMarkSeen(qc, p.id);
  }, [p?.mine, p?.status, p?.id, answers.isSuccess, lastAnswer, qc]);

  const act = async (x: Target) => {
    try {
      if (x.action === "report") {
        await askReport(x.kind, x.id);
        toast.success(A.reported);
      } else {
        await askDelete(x.kind, x.id);
        toast.success(A.removed);
        if (x.kind === "post") {
          await qc.invalidateQueries({ queryKey: ASK_KEY });
          void navigate({ to: "/ask" });
          return;
        }
      }
      await qc.invalidateQueries({ queryKey: ASK_KEY });
    } catch {
      toast.error(t.common.somethingWrong);
    }
  };

  return (
    <main className="mx-auto max-w-2xl px-4 pb-8 pt-4 md:pt-10">
      <Link to="/ask" className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-semibold text-muted-foreground hover:bg-accent hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> {A.backToAsk}
      </Link>

      {post.isLoading ? (
        <Skeleton className="mt-4 h-48 rounded-[36px_36px_36px_10px]" />
      ) : !p ? (
        <div className="mt-6 rounded-[28px] border-2 border-dashed border-primary/20 p-8 text-center">
          <h1 className="text-2xl font-extrabold">{A.notFoundTitle}</h1>
          <p className="mt-2 text-muted-foreground">{A.notFoundBody}</p>
          <Button asChild variant="hero" className="mt-6"><Link to="/ask">{A.backToAsk}</Link></Button>
        </div>
      ) : (
        <>
          <article className="mt-4 rounded-[36px_36px_36px_10px] bg-brand p-7 text-brand-foreground shadow-[0_24px_60px_-28px_oklch(0.29_0.1_264/0.65)] md:p-9">
            <p className="flex items-center gap-2 text-sm font-semibold text-brand-foreground/75">
              {p.mine ? A.yours : t.inbox.anonymous}
              <span aria-hidden="true">·</span>
              {timeAgo(p.published_at ?? p.created_at)}
            </p>
            <h1 className="mt-4 whitespace-pre-wrap break-words text-[1.45rem] font-semibold leading-snug [overflow-wrap:anywhere] md:text-[1.75rem]">{p.body}</h1>
            {p.status === "approved" && (
              <div className="mt-6 flex items-center gap-2">
                <VoteButton kind="post" id={p.id} score={p.score} voted={p.voted} disabled={p.mine} size="lg" />
                <ItemMenu dark mine={p.mine} onPick={(action) => setTarget({ kind: "post", id: p.id, action })} />
              </div>
            )}
          </article>

          {p.status !== "approved" ? (
            <p className="mt-4 flex items-start gap-2 rounded-2xl bg-muted p-4 text-sm text-muted-foreground" role="status">
              <Clock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {p.status === "hidden" ? A.hiddenPost : A.pendingPost}
            </p>
          ) : (
            <>
              <section aria-labelledby="answers-title" className="mt-8">
                <h2 id="answers-title" className="px-1 text-lg font-bold">
                  {A.answersTitle}
                  {!!answers.data?.length && <span className="ml-2 text-muted-foreground">{answers.data.length}</span>}
                </h2>
                {answers.isLoading ? (
                  <Skeleton className="mt-3 h-20 rounded-[24px_24px_24px_8px]" />
                ) : !answers.data?.length ? (
                  <p className="mt-3 px-1 text-muted-foreground">{A.beFirst}</p>
                ) : (
                  <ul className="mt-3 space-y-3">
                    {answers.data.map((a) => (
                      <AnswerItem key={a.id} a={a} onPick={(action) => setTarget({ kind: "answer", id: a.id, action })} />
                    ))}
                  </ul>
                )}
              </section>
              <AnswerBox postId={p.id} />
            </>
          )}
        </>
      )}

      <AlertDialog open={!!target} onOpenChange={(o) => { if (!o) setTarget(null); }}>
        <AlertDialogContent className="rounded-[28px] bg-popover">
          <AlertDialogHeader>
            <AlertDialogTitle>{target?.action === "delete" ? A.removeTitle : A.report}</AlertDialogTitle>
            <AlertDialogDescription>{target?.action === "delete" ? A.removeBody : A.reportBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-12 rounded-2xl">{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              className={cn("h-12 rounded-2xl", target?.action === "delete" && "bg-destructive text-destructive-foreground hover:bg-destructive/90")}
              onClick={() => {
                if (target) void act(target);
                setTarget(null);
              }}
            >
              {target?.action === "delete" ? A.remove : A.report}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

// Report for others' posts; Delete for your own (and, for admins, for anything).
function ItemMenu({ mine, dark, onPick }: { mine: boolean; dark?: boolean | undefined; onPick: (a: "report" | "delete") => void }) {
  const A = t.ask;
  const { isAdmin } = useAuth();
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={A.more}
          className={cn("press grid size-9 place-items-center rounded-full", dark ? "text-brand-foreground/80 hover:bg-white/15" : "text-muted-foreground hover:bg-accent")}
        >
          <MoreHorizontal className="size-5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48 rounded-2xl p-1.5">
        {!mine && <DropdownMenuItem className="min-h-11 rounded-xl" onSelect={() => onPick("report")}><Flag /> {A.report}</DropdownMenuItem>}
        {(mine || isAdmin) && <DropdownMenuItem className="min-h-11 rounded-xl text-destructive focus:text-destructive" onSelect={() => onPick("delete")}><Trash2 /> {A.remove}</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AnswerItem({ a, onPick }: { a: AskAnswer; onPick: (action: "report" | "delete") => void }) {
  const A = t.ask;
  const pending = a.status !== "approved";
  return (
    <li className={cn("glass rounded-[24px_24px_24px_8px] p-5", a.by_asker && "border-l-4 border-l-caramel", pending && "glass-read")}>
      <p className="flex flex-wrap items-center gap-2 text-xs font-semibold text-muted-foreground">
        {a.mine ? <span className="rounded-full bg-accent px-2.5 py-1 text-accent-foreground">{A.you}</span> : a.by_asker ? <span className="rounded-full bg-caramel/30 px-2.5 py-1 text-foreground">{A.byAsker}</span> : <span>{t.inbox.anonymous}</span>}
        {a.mine && a.by_asker && <span className="rounded-full bg-caramel/30 px-2.5 py-1 text-foreground">{A.byAsker}</span>}
        {pending && <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1"><Clock className="size-3" aria-hidden="true" />{A.statusPending}</span>}
        <span className="ml-auto font-normal">{timeAgo(a.published_at ?? a.created_at)}</span>
      </p>
      <p className="mt-2 whitespace-pre-wrap break-words text-[16px] leading-relaxed [overflow-wrap:anywhere]">{a.body}</p>
      {!pending && (
        <div className="mt-3 flex items-center gap-2">
          <VoteButton kind="answer" id={a.id} score={a.score} voted={a.voted} disabled={a.mine} />
          <ItemMenu mine={a.mine} onPick={onPick} />
        </div>
      )}
    </li>
  );
}

function AnswerBox({ postId }: { postId: string }) {
  const A = t.ask;
  const qc = useQueryClient();
  const send = useServerFn(createAskAnswer);
  const box = useRef<HTMLTextAreaElement>(null);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (sending) return;
    if (!body.trim()) return setError(A.errors.empty);
    setSending(true);
    try {
      const r = await send({ data: { postId, body } });
      if (!r.ok) return setError(A.errors[askErrorKey(r.code)]);
      setBody("");
      setError(null);
      toast.success(r.held ? A.answerHeld : A.answered);
      await qc.invalidateQueries({ queryKey: ASK_KEY });
    } catch {
      setError(A.errors.generic);
    } finally {
      setSending(false);
    }
  };
  return (
    <form onSubmit={submit} noValidate className="glass mt-6 rounded-[28px] p-4">
      <label htmlFor="answer-body" className="mb-2 block px-1 text-sm font-semibold">{A.answerLabel}</label>
      <textarea
        ref={box}
        id="answer-body"
        value={body}
        onChange={(e) => { setBody(e.target.value.slice(0, MAX_MESSAGE_LENGTH)); setError(null); }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            e.currentTarget.form?.requestSubmit();
          }
        }}
        placeholder={A.answerPlaceholder}
        rows={2}
        maxLength={MAX_MESSAGE_LENGTH}
        aria-describedby="answer-error"
        aria-invalid={!!error}
        className="max-h-[40dvh] min-h-[80px] w-full resize-none rounded-[20px] border border-input bg-field p-4 text-[16px] leading-relaxed outline-none transition [field-sizing:content] placeholder:text-muted-foreground focus:border-ring focus:ring-4 focus:ring-ring/30"
      />
      <p id="answer-error" role="alert" className="mt-2 px-1 text-sm text-destructive empty:hidden">{error}</p>
      <div className="mt-3 flex items-center justify-end gap-3">
        {body && <span className="text-xs tabular-nums text-muted-foreground">{body.length}/{MAX_MESSAGE_LENGTH}</span>}
        <Button type="submit" variant="hero" disabled={sending || !body.trim()}>
          <Send /> {sending ? A.answering : A.answerButton}
        </Button>
      </div>
    </form>
  );
}
