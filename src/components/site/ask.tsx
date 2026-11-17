import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowBigUp, MessageCircle, Send } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { t, timeAgo } from "@/i18n";
import { ASK_KEY, askVote, type AskFeedItem } from "@/lib/ask-data";
import { createAskPost } from "@/lib/ask.functions";
import { askErrorKey } from "@/lib/ask-rules";
import { MAX_MESSAGE_LENGTH } from "@/lib/moderation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// Upvote toggle. The count updates right away and is corrected from the server's answer.
export function VoteButton({ kind, id, score, voted, disabled, size = "md" }: { kind: "post" | "answer"; id: string; score: number; voted: boolean; disabled?: boolean | undefined; size?: "md" | "lg" | undefined }) {
  const A = t.ask;
  const qc = useQueryClient();
  // An optimistic value, used only until fresh server data (different props) arrives.
  const key = `${score}-${voted}`;
  const [over, setOver] = useState<{ score: number; voted: boolean; from: string } | null>(null);
  const current = over && over.from === key ? over : { score, voted };
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    if (busy || disabled) return;
    const on = !current.voted;
    setBusy(true);
    setOver({ voted: on, score: Math.max(0, current.score + (on ? 1 : -1)), from: key });
    try {
      const n = await askVote(kind, id, on);
      setOver({ voted: on, score: n, from: key });
      void qc.invalidateQueries({ queryKey: ASK_KEY });
    } catch {
      setOver(null);
      toast.error(t.common.somethingWrong);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled}
      aria-pressed={current.voted}
      aria-label={`${current.voted ? A.removeUpvote : A.upvote} (${A.votes(current.score)})`}
      title={disabled ? A.votes(current.score) : current.voted ? A.removeUpvote : A.upvote}
      className={cn(
        "press relative z-10 inline-flex items-center gap-1 rounded-full font-bold tabular-nums transition-colors disabled:cursor-default",
        size === "lg" ? "h-11 px-4 text-base" : "h-9 px-3 text-sm",
        current.voted ? "bg-caramel text-coral-foreground" : "bg-field text-foreground hover:bg-accent disabled:hover:bg-field",
      )}
    >
      <ArrowBigUp className={cn(size === "lg" ? "size-5" : "size-[18px]", current.voted && "fill-current")} aria-hidden="true" />
      {current.score}
    </button>
  );
}

// One question in a list. The whole card opens the question; the vote button sits above the link.
export function PostCard({ post }: { post: AskFeedItem }) {
  const A = t.ask;
  return (
    <article className="glass relative rounded-[26px_26px_26px_8px] p-5 transition-colors hover:bg-accent/40 focus-within:ring-2 focus-within:ring-ring/40">
      {(post.mine || post.new_answers) && (
        <p className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold">
          {post.mine && <span className="rounded-full bg-accent px-2.5 py-1 text-accent-foreground">{A.yours}</span>}
          {post.new_answers && <span className="rounded-full bg-destructive px-2.5 py-1 text-destructive-foreground">{A.newAnswers}</span>}
        </p>
      )}
      <Link to="/ask/$id" params={{ id: post.id }} className="block outline-none after:absolute after:inset-0 after:rounded-[inherit]">
        <p className="line-clamp-6 whitespace-pre-wrap break-words text-[17px] font-semibold leading-snug [overflow-wrap:anywhere]">{post.body}</p>
      </Link>
      <div className="mt-4 flex items-center gap-3 text-sm text-muted-foreground">
        <VoteButton kind="post" id={post.id} score={post.score} voted={post.voted} disabled={post.mine} />
        <span className="inline-flex items-center gap-1.5">
          <MessageCircle className="size-4" aria-hidden="true" />
          {post.answer_count ? A.answers(post.answer_count) : A.noAnswersYet}
        </span>
        <span className="ml-auto shrink-0 text-xs">{timeAgo(post.published_at)}</span>
      </div>
    </article>
  );
}

// The box for asking a question, with tap-to-use suggestions while it's empty.
export function AskComposer({ onPosted }: { onPosted?: ((held: boolean) => void) | undefined }) {
  const A = t.ask;
  const qc = useQueryClient();
  const post = useServerFn(createAskPost);
  const box = useRef<HTMLTextAreaElement>(null);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const applyIdea = (text: string) => {
    setBody(text);
    setError(null);
    requestAnimationFrame(() => {
      const el = box.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(text.length, text.length);
    });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (sending) return;
    if (!body.trim()) return setError(A.errors.empty);
    setSending(true);
    try {
      const r = await post({ data: { body } });
      if (!r.ok) {
        setError(t.ask.errors[askErrorKey(r.code)]);
        return;
      }
      setBody("");
      setError(null);
      toast.success(r.held ? A.postedHeld : A.posted);
      await qc.invalidateQueries({ queryKey: ASK_KEY });
      onPosted?.(r.held);
    } catch {
      setError(A.errors.generic);
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="glass rounded-[28px] p-4 md:p-5">
      <label htmlFor="ask-body" className="sr-only">{A.composeLabel}</label>
      <textarea
        ref={box}
        id="ask-body"
        value={body}
        onChange={(e) => { setBody(e.target.value.slice(0, MAX_MESSAGE_LENGTH)); setError(null); }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            e.currentTarget.form?.requestSubmit();
          }
        }}
        placeholder={A.placeholder}
        rows={2}
        maxLength={MAX_MESSAGE_LENGTH}
        aria-describedby="ask-error ask-rules"
        aria-invalid={!!error}
        className="max-h-[40dvh] min-h-[88px] w-full resize-none rounded-[20px] border border-input bg-field p-4 text-[17px] leading-relaxed outline-none transition [field-sizing:content] placeholder:text-muted-foreground focus:border-ring focus:ring-4 focus:ring-ring/30"
      />
      {!body && (
        <div className="mt-3">
          <p className="mb-2 px-1 text-xs font-semibold text-muted-foreground">{A.ideasLabel}</p>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0">
            {A.ideas.map((idea) => (
              <button key={idea} type="button" onClick={() => applyIdea(idea)} className="press shrink-0 rounded-full border bg-field px-3.5 py-2 text-left text-sm font-medium hover:bg-accent">
                {/[:\s]$/.test(idea) ? `${idea.replace(/[:\s]+$/, "")}…` : idea}
              </button>
            ))}
          </div>
        </div>
      )}
      <p id="ask-error" role="alert" className="mt-2 px-1 text-sm text-destructive empty:hidden">{error}</p>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
        <p id="ask-rules" className="min-w-0 flex-1 px-1 text-xs leading-relaxed text-muted-foreground">{A.rules}</p>
        <div className="flex items-center gap-3">
          {body && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{body.length}/{MAX_MESSAGE_LENGTH}</span>}
          <Button type="submit" variant="hero" className="flex-1 sm:flex-none" disabled={sending || !body.trim()}>
            <Send /> {sending ? A.posting : A.post}
          </Button>
        </div>
      </div>
    </form>
  );
}
