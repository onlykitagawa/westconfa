import { Link } from "@tanstack/react-router";
import { Globe } from "lucide-react";
import { t, timeAgo } from "@/i18n";

// Shown to the sender of a message when the recipient answered it publicly on their profile
// (Sent page and the private status link). The answer is already public; only the sender learns
// that it answers their message.
export function AnswerNotice({ answer, answeredAt, username }: { answer: string; answeredAt: string | null; username: string | null }) {
  const A = t.answerNotice;
  return (
    <section className="rounded-[22px] border border-primary/15 bg-accent p-4" aria-label={A.title}>
      <p className="flex items-center gap-2 text-sm font-semibold text-accent-foreground">
        <Globe className="size-4 shrink-0" aria-hidden="true" /> {A.title}
      </p>
      {answeredAt && <p className="mt-0.5 pl-6 text-xs text-muted-foreground">{timeAgo(answeredAt)}</p>}
      <p className="mt-2 whitespace-pre-wrap break-words text-[16px] leading-relaxed [overflow-wrap:anywhere]">{answer}</p>
      {username && (
        <Link to="/u/$username" params={{ username }} className="mt-3 inline-block text-sm font-semibold text-primary underline-offset-4 hover:underline">
          {A.link(username)}
        </Link>
      )}
    </section>
  );
}
