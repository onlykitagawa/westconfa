import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Check, CheckCheck, Clock, Eye, RefreshCw, XCircle } from "lucide-react";
import { t } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/m/$token")({
  head: () => ({
    meta: [
      { title: t.track.metaTitle }, { name: "description", content: t.track.metaDesc },
      { name: "robots", content: "noindex, nofollow" }, { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: TrackPage,
});

type State = "waiting" | "delivered" | "seen" | "not_delivered";
type Status = { state: State; sent_at: string; body: string | null };

// The private status page a sender gets after sending. The token is never stored;
// message_status() matches its hash and returns only the state, time and the sender's own text.
function TrackPage() {
  const { token } = Route.useParams();
  const T = t.track;
  const q = useQuery({
    queryKey: ["message-status", token],
    queryFn: async (): Promise<Status | null> => {
      const { data, error } = await supabase.rpc("message_status", { _token: token });
      if (error) throw error;
      const row = (data ?? [])[0];
      return row ? (row as Status) : null;
    },
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  });

  if (q.isLoading)
    return (
      <main className="mx-auto max-w-lg px-4 pt-6 md:pt-14">
        <Skeleton className="h-72 rounded-[32px]" />
      </main>
    );

  if (q.isError || !q.data)
    return (
      <main className="mx-auto max-w-md px-5 pt-16 text-center">
        <h1 className="text-3xl font-extrabold">{q.isError ? t.common.somethingWrong : T.notFoundTitle}</h1>
        {!q.isError && <p className="mt-3 text-muted-foreground">{T.notFoundBody}</p>}
        <Button asChild variant="hero" className="mt-8"><Link to="/">{t.common.getYourOwn}</Link></Button>
      </main>
    );

  const { state, sent_at, body } = q.data;
  const reached = state === "delivered" || state === "seen";
  const steps = [
    { label: T.sent, done: true, Icon: Check },
    { label: T.delivered, done: reached, Icon: CheckCheck },
    { label: T.seen, done: state === "seen", Icon: Eye },
  ];
  const line =
    state === "waiting" ? T.waitingBody : state === "delivered" ? T.deliveredBody : state === "seen" ? T.seenBody : T.notDeliveredBody;

  return (
    <main className="mx-auto max-w-lg px-4 pt-6 md:pt-14">
      <div className="glass animate-rise rounded-[32px] p-6 md:p-8">
        <p className="text-sm font-medium text-muted-foreground">{T.sentAgo(formatDistanceToNow(new Date(sent_at), { addSuffix: true }))}</p>
        <h1 className="mt-1 text-[28px] font-extrabold">{T.title}</h1>

        {body ? (
          <p className="mt-5 whitespace-pre-wrap break-words rounded-[22px] bg-field p-[18px] text-[17px] leading-relaxed [overflow-wrap:anywhere]">{body}</p>
        ) : (
          <p className="mt-5 rounded-[22px] bg-muted p-[18px] text-sm text-muted-foreground">{T.gone}</p>
        )}

        {state === "not_delivered" ? (
          <div className="mt-6 flex items-start gap-3 rounded-2xl bg-destructive/10 p-4 text-destructive" role="status">
            <XCircle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-semibold">{T.notDelivered}</p>
              <p className="mt-1 text-sm">{line}</p>
            </div>
          </div>
        ) : (
          <>
            <ol className="mt-6 grid grid-cols-3 gap-2" aria-label={T.title}>
              {steps.map(({ label, done, Icon }) => (
                <li
                  key={label}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-2xl p-3 text-center text-sm font-semibold",
                    done ? "bg-brand text-brand-foreground" : "bg-muted text-muted-foreground",
                  )}
                >
                  <Icon className="size-5" aria-hidden="true" />
                  {label}
                  <span className="sr-only">{done ? "✓" : "–"}</span>
                </li>
              ))}
            </ol>
            <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground" role="status" aria-live="polite">
              {state === "waiting" && <Clock className="size-4 shrink-0" aria-hidden="true" />}
              {line}
            </p>
          </>
        )}

        <Button variant="ghost" className="mt-4 w-full" onClick={() => q.refetch()} disabled={q.isFetching}>
          <RefreshCw className={cn(q.isFetching && "animate-spin")} /> {T.refresh}
        </Button>
        <p className="mt-4 text-center text-xs text-muted-foreground">{T.privateNote}</p>
      </div>
    </main>
  );
}
