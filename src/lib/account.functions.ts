import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Permanently deletes the caller's auth user; profile and messages cascade. The profile photo
// file lives in storage, so it is removed here as well.
export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { removeAvatarObject } = await import("./avatar-storage.server");
    const { data: profile } = await supabaseAdmin.from("profiles").select("avatar_url").eq("id", context.userId).maybeSingle();
    const { error } = await supabaseAdmin.auth.admin.deleteUser(context.userId);
    if (error) throw new Error("Could not delete account");
    await removeAvatarObject(supabaseAdmin, profile?.avatar_url);
    return { ok: true };
  });
