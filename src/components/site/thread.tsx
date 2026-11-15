import { formatDistanceToNow } from "date-fns";
import { Send } from "lucide-react";
import { useState } from "react";
import { t } from "@/i18n";
import { MAX_MESSAGE_LENGTH } from "@/lib/moderation";
import type { ReplyResult } from "@/lib/replies.functions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ThreadRow = { id: string; author: string; body: string; created_at: string; status: string };

// A private back-and-forth. `viewer` is who is looking: their own bubbles sit on the right.
export function ThreadBubbles({ rows, viewer }: { rows: ThreadRow[]; viewer: "owner" | "sender" }) {
  const T = t.thread;
  return (
    <ol className="space-y-3" aria-label={T.title}>
      {rows.map((r) => {
        const mine = r.author === viewer;
        const label = mine ? T.you : viewer === "owner" ? T.anonymous : T.them;
        return (
          <li key={r.id} className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
            <span className="mb-1 px-1 text-xs font-semibold text-muted-foreground">
              {label} · {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
            </span>
            <p
              className={cn(
                "max-w-[85%] whitespace-pre-wrap break-words rounded-[22px] px-4 py-3 text-[16px] leading-snug [overflow-wrap:anywhere]",
                mine ? "rounded-br-lg bg-brand text-brand-foreground" : "glass rounded-bl-lg",
                r.status === "pending" && "opacity-70",
              )}
            >
              {r.body}
            </p>
            {r.status === "pending" && <span className="mt-1 px-1 text-xs text-muted-foreground">{T.pending}</span>}
          </li>
        );
      })}
    </ol>
  );
}

// A small writing box shared by private replies and public answers. The server decides whether
// the text is delivered, held for a moderator or refused; this only shows the outcome.
export function ReplyBox({
  placeholder, sendLabel, onSubmit, onDone, autoFocus,
}: {
  placeholder: string;
  sendLabel: string;
  onSubmit: (text: string) => Promise<ReplyResult>;
  onDone: (held: boolean) => void;
  autoFocus?: boolean;
}) {
  const T = t.thread;
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const remaining = MAX_MESSAGE_LENGTH - text.length;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body) return setError(T.errors.empty);
    setBusy(true);
    setError(null);
    try {
      const res = await onSubmit(body);
      if (res.ok) {
        setText("");
        onDone(res.held);
      } else setError(T.errors[res.code]);
    } catch {
      setError(T.errors.generic);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-2">
      <textarea
        value={text}
        onChange={(e) => { setText(e.target.value.slice(0, MAX_MESSAGE_LENGTH)); setError(null); }}
        placeholder={placeholder}
        aria-label={placeholder}
        rows={3}
        maxLength={MAX_MESSAGE_LENGTH}
        autoFocus={autoFocus}
        className="min-h-[96px] w-full resize-none rounded-[20px] border border-input bg-field p-4 text-[16px] leading-relaxed outline-none transition placeholder:text-muted-foreground focus:border-ring focus:ring-4 focus:ring-ring/30"
      />
      <div className="flex items-start justify-between gap-3 px-1 text-sm">
        <p role="alert" className="text-destructive">{error}</p>
        <span className={cn("shrink-0 tabular-nums text-muted-foreground", remaining < 50 && "font-semibold text-primary")}>{text.length}/{MAX_MESSAGE_LENGTH}</span>
      </div>
      <Button type="submit" variant="hero" className="h-12 w-full" disabled={busy || !text.trim()}>
        <Send /> {busy ? T.sending : sendLabel}
      </Button>
    </form>
  );
}
