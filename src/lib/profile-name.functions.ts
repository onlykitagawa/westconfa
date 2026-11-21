import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isValidUsername } from "./moderation";
import { DISPLAY_NAME_MAX, screenName, type NameField } from "./name-screening";

export type NameResult = { ok: true } | { ok: false; code: "invalid" | "taken" | "blocked" | "generic"; field?: NameField | undefined };

// Username and display name are saved only here (clients cannot write those columns), after the AI
// has checked whatever changed. Admins are trusted and skip the check.
export const saveProfileName = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ username: z.string().max(60), displayName: z.string().max(DISPLAY_NAME_MAX * 3) }).parse(input))
  .handler(async ({ data, context }): Promise<NameResult> => {
    const username = data.username.trim().toLowerCase();
    const displayName = data.displayName.trim().replace(/\s+/g, " ");
    if (!isValidUsername(username)) return { ok: false, code: "invalid", field: "username" };
    if (displayName.length > DISPLAY_NAME_MAX) return { ok: false, code: "invalid", field: "display_name" };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: current, error: readError } = await supabaseAdmin.from("profiles").select("username, display_name").eq("id", context.userId).single();
    if (readError || !current) return { ok: false, code: "generic" };
    const newUsername = username !== current.username ? username : null;
    const newDisplayName = displayName && displayName !== (current.display_name ?? "") ? displayName : null;

    const { isAdminUser } = await import("./admin-check.server");
    if (!(await isAdminUser(supabaseAdmin, context.userId))) {
      const { callNameAI } = await import("./ai-moderation.server");
      const decision = await screenName(newUsername, newDisplayName, callNameAI);
      if (!decision.ok) return { ok: false, code: "blocked", field: decision.field };
    }

    const { error } = await supabaseAdmin.from("profiles").update({ username, display_name: displayName || null }).eq("id", context.userId);
    if (error) return { ok: false, code: error.code === "23505" ? "taken" : "generic", field: error.code === "23505" ? "username" : undefined };
    return { ok: true };
  });
