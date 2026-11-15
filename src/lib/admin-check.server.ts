import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

// Server-only: is this signed-in account an admin? Admins skip the content checks and spam limits
// that apply to everyone else. The answer always comes from the database (never from the browser),
// and any failure counts as "not an admin", so a problem here can only make the rules stricter.
export async function isAdminUser(admin: SupabaseClient<Database>, userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  try {
    const { data, error } = await admin.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
    return !error && data?.role === "admin";
  } catch {
    return false;
  }
}
