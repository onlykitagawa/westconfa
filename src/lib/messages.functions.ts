import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { screenMessage } from "./message-screening";
import {
  checkMessage,
  isRateLimited,
  MAX_MESSAGE_LENGTH,
} from "./moderation";

export type SendResult =
  | { ok: true }
  | { ok: false; code: "slur" | "threat" | "personal" | "rate" | "paused" | "notfound" | "empty" | "self" | "generic" | "blocked" };

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
    // Optional: if the sender is signed in, key spam limits on their account instead of the
    // shared network address (campus Wi-Fi puts many students behind one IP). The account is
    // only used for a salted hash in rate_events, never stored with the message.
    let senderUserId: string | null = null;
    const auth = req.headers.get("authorization");
    if (auth?.startsWith("Bearer ")) {
      const { data: u } = await supabaseAdmin.auth.getUser(auth.slice(7));
      senderUserId = u.user?.id ?? null;
    }
    if (senderUserId && senderUserId === profile.id) return { ok: false, code: "self" };
    const ip =
      req.headers.get("cf-connecting-ip") ??
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "unknown";
    const salt = process.env["IP_HASH_SALT"] ?? "";
    const ipHash = await sha256(senderUserId ? `${salt}:user:${senderUserId}` : `${salt}:${ip}`);
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const [{ count: total }, { count: toRecipient }, { count: anonToRecipient }] = await Promise.all([
      supabaseAdmin.from("rate_events").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("created_at", hourAgo),
      supabaseAdmin
        .from("rate_events")
        .select("id", { count: "exact", head: true })
        .eq("ip_hash", ipHash)
        .eq("recipient_id", profile.id)
        .gte("created_at", hourAgo),
      supabaseAdmin
        .from("rate_events")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", profile.id)
        .eq("anonymous", true)
        .gte("created_at", hourAgo),
    ]);
    if (isRateLimited({ signedIn: !!senderUserId, total: total ?? 0, toRecipient: toRecipient ?? 0, anonToRecipient: anonToRecipient ?? 0 })) {
      return { ok: false, code: "rate" };
    }

    const { callModerationAI } = await import("./ai-moderation.server");
    const { data: setting, error: settingError } = await supabaseAdmin.from("app_settings").select("value").eq("key", "review_all_messages").maybeSingle();
    // Missing/unreadable settings fail closed. The SQL transaction checks this again.
    const decision = await screenMessage(body, !!settingError || setting?.value !== false, callModerationAI);
    if (decision.blocked) return { ok: false, code: "blocked" };
    // Message, private moderation record and separate rate event commit atomically.
    const { error } = await supabaseAdmin.rpc("store_screened_message", {
      _recipient_id: profile.id, _body: body, _status: decision.status,
      _source: decision.source, _category: decision.category, _reason: decision.reason,
      _rate_hash: ipHash, _anonymous: !senderUserId,
      // Private moderator-only sender record: account id for signed-in senders, network hash for guests.
      _sender_user_id: senderUserId, _sender_network_hash: senderUserId ? null : ipHash,
    });
    if (error) {
      return { ok: false, code: "generic" };
    }
    // Opportunistic cleanup of hashes older than 24h.
    await supabaseAdmin.from("rate_events").delete().lt("created_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString());
    return { ok: true };
  });
