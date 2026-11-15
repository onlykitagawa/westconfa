import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { BIO_MAX_LENGTH } from "./moderation";
import { screenText } from "./text-screening";

export type BioResult = { ok: true } | { ok: false; code: "personal" | "blocked" | "held" | "generic" };

// A bio is public, so it is checked like a message before it is saved. There is no review queue for
// bios: anything held or refused simply isn't saved. Clients cannot write the bio column directly.
export const updateBio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ bio: z.string().max(BIO_MAX_LENGTH * 3) }).parse(input))
  .handler(async ({ data, context }): Promise<BioResult> => {
    const bio = data.bio.trim();
    if (bio.length > BIO_MAX_LENGTH) return { ok: false, code: "generic" };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (bio) {
      const { isAdminUser } = await import("./admin-check.server");
      const s = await screenText(bio, false, await isAdminUser(supabaseAdmin, context.userId));
      if (!s.ok) return { ok: false, code: s.code === "personal" || s.code === "blocked" ? s.code : "generic" };
      if (s.status === "pending") return { ok: false, code: "held" };
    }
    const { error } = await supabaseAdmin.rpc("set_profile_bio", { _user: context.userId, _bio: bio });
    return error ? { ok: false, code: "generic" } : { ok: true };
  });
