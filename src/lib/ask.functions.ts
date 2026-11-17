import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MAX_MESSAGE_LENGTH } from "./moderation";
import { screenText } from "./text-screening";
import { aiOpinion, askErrorFromDb, type AskError } from "./ask-rules";

// "Ask": the anonymous campus feed. Writing goes through the server so every post and answer is
// screened first. Reading, voting and reporting use database functions directly (they never reveal
// who wrote anything).
export type { AskError };
export type AskResult = { ok: true; id: string; held: boolean } | { ok: false; code: AskError };

const textSchema = z.string().max(MAX_MESSAGE_LENGTH * 2);

async function screen(userId: string, raw: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { isAdminUser } = await import("./admin-check.server");
  const trusted = await isAdminUser(supabaseAdmin, userId);
  return { supabaseAdmin, trusted, s: await screenText(raw, false, trusted) };
}

export const createAskPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ body: textSchema }).parse(input))
  .handler(async ({ data, context }): Promise<AskResult> => {
    const { supabaseAdmin, trusted, s } = await screen(context.userId, data.body);
    if (!s.ok) return s;
    const { data: rows, error } = await supabaseAdmin.rpc("store_ask_post", {
      _author: context.userId, _body: s.body, _ai_says: aiOpinion(s), _reason: s.reason, _trusted: trusted,
    });
    const row = rows?.[0];
    if (error || !row) return { ok: false, code: askErrorFromDb(error?.message) };
    return { ok: true, id: row.id, held: row.status !== "approved" };
  });

export const createAskAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ postId: z.string().uuid(), body: textSchema }).parse(input))
  .handler(async ({ data, context }): Promise<AskResult> => {
    const { supabaseAdmin, trusted, s } = await screen(context.userId, data.body);
    if (!s.ok) return s;
    const { data: rows, error } = await supabaseAdmin.rpc("store_ask_answer", {
      _author: context.userId, _post_id: data.postId, _body: s.body, _ai_says: aiOpinion(s), _reason: s.reason, _trusted: trusted,
    });
    const row = rows?.[0];
    if (error || !row) return { ok: false, code: askErrorFromDb(error?.message) };
    return { ok: true, id: row.id, held: row.status !== "approved" };
  });
