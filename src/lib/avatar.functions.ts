import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AVATAR_BASE64_MAX, AVATAR_MAX_BYTES, avatarSizeOk, base64ToBytes, bytesToBase64, cleanJpeg, parseAvatarVerdict } from "./avatar-image";

export type AvatarError = "invalid" | "refused" | "limit" | "unavailable" | "notfound" | "generic";
export type AvatarResult = { ok: true; url: string | null } | { ok: false; code: AvatarError };

const BUCKET = "avatars";
// SQL NULL clears the photo. The generated function types don't allow null for text arguments.
const NO_PHOTO = null as unknown as string;

function mapError(error: { message?: string } | null): AvatarError {
  const m = error?.message ?? "";
  if (m.includes("avatar_limit")) return "limit";
  if (m.includes("not_allowed") || m.includes("Forbidden")) return "notfound";
  return "generic";
}

// The browser sends a cropped, shrunk JPEG as base64. Everything is re-checked here: the bytes
// must be a clean JPEG of a sensible size, the hourly limit applies, and an AI vision check must
// say "allow" (anything else, including an AI outage, refuses the photo). Only then is it stored
// under a random name and linked to the profile.
export const uploadAvatar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ image: z.string().min(100).max(AVATAR_BASE64_MAX) }).parse(input))
  .handler(async ({ data, context }): Promise<AvatarResult> => {
    const raw = base64ToBytes(data.image);
    if (!raw || raw.length > AVATAR_MAX_BYTES) return { ok: false, code: "invalid" };
    const clean = cleanJpeg(raw);
    if (!clean || !avatarSizeOk(clean.width, clean.height)) return { ok: false, code: "invalid" };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { removeAvatarObject } = await import("./avatar-storage.server");
    // Admins skip the hourly limit and the AI check (the file itself is still validated above).
    const { isAdminUser } = await import("./admin-check.server");
    if (!(await isAdminUser(supabaseAdmin, context.userId))) {
      const gate = await supabaseAdmin.rpc("start_avatar_upload", { _user: context.userId });
      if (gate.error) return { ok: false, code: mapError(gate.error) };

      let allowed = false;
      try {
        const { callAvatarAI } = await import("./avatar-screening.server");
        allowed = parseAvatarVerdict(await callAvatarAI(bytesToBase64(clean.bytes)));
      } catch {
        return { ok: false, code: "unavailable" };
      }
      if (!allowed) return { ok: false, code: "refused" };
    }

    const path = `${context.userId}/${crypto.randomUUID()}.jpg`;
    const stored = await supabaseAdmin.storage.from(BUCKET).upload(path, clean.bytes, { contentType: "image/jpeg", cacheControl: "31536000", upsert: false });
    if (stored.error) return { ok: false, code: "generic" };
    const url = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    const { data: old, error } = await supabaseAdmin.rpc("set_profile_avatar", { _user: context.userId, _url: url });
    if (error) {
      await removeAvatarObject(supabaseAdmin, url);
      return { ok: false, code: mapError(error) };
    }
    await removeAvatarObject(supabaseAdmin, old);
    return { ok: true, url };
  });

export const removeAvatar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AvatarResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { removeAvatarObject } = await import("./avatar-storage.server");
    const { data: old, error } = await supabaseAdmin.rpc("set_profile_avatar", { _user: context.userId, _url: NO_PHOTO });
    if (error) return { ok: false, code: mapError(error) };
    await removeAvatarObject(supabaseAdmin, old);
    return { ok: true, url: null };
  });

// Two different signed-in students reporting a photo takes it down until its owner uploads a new one.
export const reportAvatar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ username: z.string().regex(/^[a-z0-9_]{3,20}$/) }).parse(input))
  .handler(async ({ data, context }): Promise<AvatarResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { removeAvatarObject } = await import("./avatar-storage.server");
    const { data: removed, error } = await supabaseAdmin.rpc("report_avatar", { _reporter: context.userId, _username: data.username });
    if (error) return { ok: false, code: mapError(error) };
    await removeAvatarObject(supabaseAdmin, removed);
    return { ok: true, url: null };
  });

// Admins only: the database function checks the role with the caller's own session.
export const adminRemoveAvatar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<AvatarResult> => {
    const { data: old, error } = await context.supabase.rpc("admin_clear_avatar", { _user_id: data.userId });
    if (error) return { ok: false, code: mapError(error) };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { removeAvatarObject } = await import("./avatar-storage.server");
    await removeAvatarObject(supabaseAdmin, old);
    return { ok: true, url: null };
  });
