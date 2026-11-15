import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { screenMessage } from "./message-screening";
import { checkMessage, MAX_MESSAGE_LENGTH } from "./moderation";

export type ReplyError =
  | "empty" | "personal" | "blocked" | "closed" | "turn" | "pending" | "full" | "notfound" | "duplicate" | "limit" | "generic";
export type ReplyResult = { ok: true; held: boolean } | { ok: false; code: ReplyError };

const textSchema = z.string().max(MAX_MESSAGE_LENGTH * 2);

async function sha256(input: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

type Screened = { ok: true; body: string; status: "approved" | "pending"; reason: string } | { ok: false; code: ReplyError };

// Same rules as a first message: contact details are refused, the AI blocks only the worst,
// swearing/threat words and anything the AI is unsure about wait for a human moderator.
async function screenText(raw: string, reviewAll: boolean): Promise<Screened> {
  const body = raw.trim();
  if (!body) return { ok: false, code: "empty" };
  if (body.length > MAX_MESSAGE_LENGTH) return { ok: false, code: "generic" };
  const filterHit = checkMessage(body);
  if (filterHit === "personal") return { ok: false, code: "personal" };
  const { callModerationAI } = await import("./ai-moderation.server");
  const screened = await screenMessage(body, reviewAll, callModerationAI);
  if (screened.blocked) return { ok: false, code: "blocked" };
  if (filterHit && screened.status === "approved") {
    return { ok: true, body, status: "pending", reason: filterHit === "threat" ? "Word filter: possible threat." : "Word filter: swearing or offensive word." };
  }
  return { ok: true, body, status: screened.status, reason: screened.reason };
}

function mapError(error: { message?: string; code?: string } | null): ReplyError {
  const m = error?.message ?? "";
  if (m.includes("thread_closed")) return "closed";
  if (m.includes("not_your_turn")) return "turn";
  if (m.includes("pending_exists")) return "pending";
  if (m.includes("thread_full")) return "full";
  if (m.includes("answer_limit")) return "limit";
  if (m.includes("not_allowed")) return "notfound";
  if (error?.code === "23505") return "duplicate";
  return "generic";
}

// The recipient answers a message in private. Only the message's recipient can reply, and the
// reply opens the thread: the sender can answer back through their private status link.
export const replyToMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ messageId: z.string().uuid(), body: textSchema }).parse(input))
  .handler(async ({ data, context }): Promise<ReplyResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: own } = await supabaseAdmin.from("messages").select("id").eq("id", data.messageId).eq("recipient_id", context.userId).eq("status", "approved").eq("hidden", false).maybeSingle();
    if (!own) return { ok: false, code: "notfound" };
    const s = await screenText(data.body, false);
    if (!s.ok) return s;
    const { error } = await supabaseAdmin.rpc("add_owner_reply", { _owner: context.userId, _message_id: data.messageId, _body: s.body, _status: s.status, _reason: s.reason });
    return error ? { ok: false, code: mapError(error) } : { ok: true, held: s.status === "pending" };
  });

// The sender writes back using their private status link (only its hash is stored). They can
// only answer after the recipient has replied, one message at a time.
export const replyAsSender = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ token: z.string().min(32).max(64), body: textSchema }).parse(input))
  .handler(async ({ data }): Promise<ReplyResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Cheap checks first so closed or unopened threads never cost an AI call.
    const { data: rows } = await supabaseAdmin.rpc("message_thread", { _token: data.token });
    const first = rows?.[0];
    if (!first) return { ok: false, code: "notfound" };
    if (first.closed) return { ok: false, code: "closed" };
    if (!first.can_reply) return { ok: false, code: (rows ?? []).some((r) => r.author === "sender" && r.status === "pending") ? "pending" : "turn" };
    const { data: setting, error: settingError } = await supabaseAdmin.from("app_settings").select("value").eq("key", "review_all_messages").maybeSingle();
    const s = await screenText(data.body, !!settingError || setting?.value !== false);
    if (!s.ok) return s;
    const { error } = await supabaseAdmin.rpc("add_sender_reply", { _token_hash: await sha256(data.token), _body: s.body, _status: s.status, _reason: s.reason });
    return error ? { ok: false, code: mapError(error) } : { ok: true, held: s.status === "pending" };
  });

// The recipient posts a message and their answer on their public profile. The question text is
// copied; nothing links the card to the sender.
export const answerPublicly = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ messageId: z.string().uuid(), answer: textSchema }).parse(input))
  .handler(async ({ data, context }): Promise<ReplyResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: own } = await supabaseAdmin.from("messages").select("id").eq("id", data.messageId).eq("recipient_id", context.userId).eq("status", "approved").eq("hidden", false).maybeSingle();
    if (!own) return { ok: false, code: "notfound" };
    const s = await screenText(data.answer, false);
    if (!s.ok) return s;
    const { error } = await supabaseAdmin.rpc("publish_answer", { _owner: context.userId, _message_id: data.messageId, _answer: s.body, _status: s.status, _reason: s.reason });
    return error ? { ok: false, code: mapError(error) } : { ok: true, held: s.status === "pending" };
  });
