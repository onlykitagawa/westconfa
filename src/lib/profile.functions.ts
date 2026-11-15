import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type PublicProfile = { username: string; display_name: string; accepting: boolean; bio: string | null } | null;

export const getPublicProfile = createServerFn({ method: "GET" })
  .inputValidator((input: { username: string }) => ({ username: String(input.username).toLowerCase().slice(0, 30) }))
  .handler(async ({ data }): Promise<PublicProfile> => {
    if (!/^[a-z0-9_]{3,20}$/.test(data.username)) return null;
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const client = createClient<Database>(process.env["SUPABASE_URL"]!, key, {
      auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
      global: {
        fetch: (input, init) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    });
    const { data: rows } = await client.rpc("get_public_profile", { _username: data.username });
    const row = rows?.[0];
    return row ? { username: row.username, display_name: row.display_name, accepting: row.accepting, bio: row.bio } : null;
  });
