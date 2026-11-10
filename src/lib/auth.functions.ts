import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { LOGIN_MAX_FAILED_ATTEMPTS, LOGIN_WINDOW_MINUTES } from "./moderation";

export type SignInResult =
  | { ok: true; access_token: string; refresh_token: string }
  | { ok: false; code: "invalid" | "locked" | "generic" | "unverified" };

const schema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  password: z.string().min(1).max(200),
});

async function sha256(input: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Password sign-in with a per-account failed-attempt limit. Errors are neutral so
// they never reveal whether an account exists.
export const passwordSignIn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => schema.parse(input))
  .handler(async ({ data }): Promise<SignInResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const emailHash = await sha256(`${process.env["IP_HASH_SALT"] ?? ""}:login:${data.email}`);
    const since = new Date(Date.now() - LOGIN_WINDOW_MINUTES * 60 * 1000).toISOString();

    const { count } = await supabaseAdmin
      .from("login_attempts")
      .select("id", { count: "exact", head: true })
      .eq("email_hash", emailHash)
      .gte("created_at", since);
    if ((count ?? 0) >= LOGIN_MAX_FAILED_ATTEMPTS) return { ok: false, code: "locked" };

    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const client = createClient(process.env["SUPABASE_URL"]!, key, {
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
    const { data: res, error } = await client.auth.signInWithPassword({ email: data.email, password: data.password });
    if (error || !res.session) {
      if (error?.code === "email_not_confirmed") return { ok: false, code: "unverified" };
      await supabaseAdmin.from("login_attempts").insert({ email_hash: emailHash });
      if (error && error.status && error.status >= 500) return { ok: false, code: "generic" };
      return { ok: false, code: "invalid" };
    }
    await supabaseAdmin.from("login_attempts").delete().eq("email_hash", emailHash);
    return { ok: true, access_token: res.session.access_token, refresh_token: res.session.refresh_token };
  });
