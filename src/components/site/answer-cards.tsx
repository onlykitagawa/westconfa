import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Flag, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { t } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type Answer = { id: string; question: string; answer: string; created_at: string };

// Messages the owner chose to answer in public. Only the text is shown; nothing links a card to its sender.
export function AnswerCards({ username, isOwner, canReport, empty }: { username: string; isOwner: boolean; canReport: boolean; empty?: ReactNode }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["answers", username],
    staleTime: 30_000,
    queryFn: async (): Promise<Answer[]> => {
      const { data, error } = await supabase.rpc("get_public_answers", { _username: username });
      if (error) throw error;
      return data ?? [];
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["answers", username] });
  const remove = async (id: string) => {
    const { error } = await supabase.from("public_answers").delete().eq("id", id);
    if (error) {
      toast.error(t.common.somethingWrong);
      return;
    }
    toast.success(t.send.qaRemoved);
    refresh();
  };
  const report = async (id: string) => {
    const { error } = await supabase.rpc("report_answer", { _answer_id: id });
    if (error) {
      toast.error(t.common.somethingWrong);
      return;
    }
    toast.success(t.send.qaReported);
  };
  if (!q.data?.length) return q.isLoading || !empty ? null : <>{empty}</>;
  return (
    <section className="mt-6" aria-labelledby="qa-title">
      <h2 id="qa-title" className="px-1 text-sm font-bold uppercase tracking-wider text-muted-foreground">{t.send.qaTitle}</h2>
      <ul className="mt-3 space-y-3">
        {q.data.map((a) => (
          <li key={a.id} className="glass animate-rise rounded-[26px] p-5">
            <p className="text-xs font-semibold text-muted-foreground">{t.send.qaAsked}</p>
            <p className="mt-1 whitespace-pre-wrap break-words rounded-[18px] bg-field px-4 py-3 text-[16px] leading-snug [overflow-wrap:anywhere]">{a.question}</p>
            <p className="mt-3 whitespace-pre-wrap break-words px-1 text-[17px] font-medium leading-snug [overflow-wrap:anywhere]">{a.answer}</p>
            {(isOwner || canReport) && (
              <div className="mt-3 flex justify-end">
                {isOwner ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => remove(a.id)}><Trash2 /> {t.send.qaRemove}</Button>
                ) : (
                  <Button type="button" variant="ghost" size="sm" onClick={() => report(a.id)}><Flag /> {t.send.qaReport}</Button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
