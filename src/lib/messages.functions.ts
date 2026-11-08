import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import {
  checkMessage,
  LIMIT_PER_SENDER_PER_HOUR,
  LIMIT_PER_SENDER_TO_RECIPIENT_PER_HOUR,
  MAX_MESSAGE_LENGTH,
} from "./moderation";

export type SendResult =
  | { ok: true }
  | { ok: false; code: "slur" | "threat" | "personal" | "rate" | "paused" | "notfound" | "empty" | "generic" };

const schema = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,20}$/),
  body: z.string().max(MAX_MESSAGE_LENGTH * 2),
  website: z.string().max(200).optional(), // honeypot
});

async function sha256(input: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Public endpoint: anyone can send. Sender identity is never stored with the message.
export const sendMessage = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => schema.parse(input))
  .handler(async ({ data }): Promise<SendResult> => {
    // Honeypot: pretend success so bots don't learn.
    if (data.website) return { ok: true };

    const body = data.body.trim();
    if (!body) return { ok: false, code: "empty" };
    if (body.length > MAX_MESSAGE_LENGTH) return { ok: false, code: "generic" };
    const reason = checkMessage(body);
    if (reason) return { ok: false, code: reason };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, inbox_paused, suspended")
      .eq("username", data.username)
      .maybeSingle();
    if (!profile) return { ok: false, code: "notfound" };
    if (profile.inbox_paused || profile.suspended) return { ok: false, code: "paused" };

    const req = getRequest();
    const ip =
      req.headers.get("cf-connecting-ip") ??
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "unknown";
    const salt = process.env["IP_HASH_SALT"] ?? "";
    const ipHash = await sha256(`${salt}:${ip}`);
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const [{ count: total }, { count: toRecipient }] = await Promise.all([
      supabaseAdmin.from("rate_events").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("created_at", hourAgo),
      supabaseAdmin
        .from("rate_events")
        .select("id", { count: "exact", head: true })
        .eq("ip_hash", ipHash)
        .eq("recipient_id", profile.id)
        .gte("created_at", hourAgo),
    ]);
    if ((total ?? 0) >= LIMIT_PER_SENDER_PER_HOUR || (toRecipient ?? 0) >= LIMIT_PER_SENDER_TO_RECIPIENT_PER_HOUR) {
      return { ok: false, code: "rate" };
    }

    const { error } = await supabaseAdmin.from("messages").insert({ recipient_id: profile.id, body });
    if (error) {
      console.error("send failed", error.message);
      return { ok: false, code: "generic" };
    }
    await supabaseAdmin.from("rate_events").insert({ ip_hash: ipHash, recipient_id: profile.id });
    // Opportunistic cleanup of hashes older than 24h.
    await supabaseAdmin.from("rate_events").delete().lt("created_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString());
    return { ok: true };
  });
