import type { SupabaseClient, EmailOtpType } from "@supabase/supabase-js";

export type AuthLinkResult = { ok: boolean; email?: string; userId?: string; recovery: boolean };

export function readAuthLink(url: URL) {
  const params = new URLSearchParams(url.search);
  new URLSearchParams(url.hash.slice(1)).forEach((value, key) => params.set(key, value));
  if (!["access_token", "refresh_token", "token_hash", "code", "error", "error_description", "error_code"].some((key) => params.has(key))) return null;
  return params;
}

// Capture and remove credentials before the generated client can auto-consume them.
// Only the verified user's identity, never link credentials, enters router context.
export async function consumeAuthLink(
  params: URLSearchParams,
  client: SupabaseClient,
  clearPrivateData: () => Promise<void>,
): Promise<AuthLinkResult> {
  const recovery = params.get("type") === "recovery";
  await clearPrivateData();
  const failed = { ok: false, recovery };
  try {
    // PKCE exchange needs the old client's verifier; sign-out would remove it.
    if (params.has("code")) {
      const { data, error } = await client.auth.exchangeCodeForSession(params.get("code") ?? "");
      if (error || !data.session) {
        await client.auth.signOut({ scope: "local" });
        return failed;
      }
      const session = data.session;
      // Exchange has already replaced the old session. Do not revoke the new token.
      return { ok: true, email: session.user.email, userId: session.user.id, recovery: recovery || data.redirectType === "recovery" };
    }
    const { error: signOutError } = await client.auth.signOut({ scope: "local" });
    if (signOutError) return failed;
    if (params.has("error") || params.has("error_description") || params.has("error_code")) return failed;
    if (params.has("token_hash")) {
      const type = params.get("type");
      const types: EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];
      const otpType = types.find((value) => value === type);
      if (!otpType) return failed;
      const { data, error } = await client.auth.verifyOtp({ token_hash: params.get("token_hash") ?? "", type: otpType });
      if (error || !data.session) return failed;
    } else {
      const access_token = params.get("access_token");
      const refresh_token = params.get("refresh_token");
      if (!access_token || !refresh_token) return failed;
      const { error } = await client.auth.setSession({ access_token, refresh_token });
      if (error) return failed;
    }
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) return failed;
    return { ok: true, email: data.user.email, userId: data.user.id, recovery };
  } catch {
    return failed;
  }
}