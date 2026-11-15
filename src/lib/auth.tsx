import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { SESSION_MAX_DAYS } from "@/lib/moderation";
import type { AuthLinkResult } from "@/lib/auth-link";

const STAMP = "wc_signed_in_at";
// Keeps students signed in for SESSION_MAX_DAYS on this device (tokens refresh automatically),
// then asks for the password again.
function sessionExpired(): boolean {
  const raw = localStorage.getItem(STAMP);
  if (!raw) { localStorage.setItem(STAMP, String(Date.now())); return false; }
  return Date.now() - Number(raw) > SESSION_MAX_DAYS * 86400000;
}

export type Profile = {
  id: string;
  email: string;
  username: string | null;
  display_name: string | null;
  inbox_paused: boolean;
  searchable: boolean;
  bio: string | null;
  avatar_url: string | null;
  suspended: boolean;
};

type AuthState = {
  user: User | null;
  profile: Profile | null;
  isAdmin: boolean;
  loading: boolean;
  openedAuthLink: boolean;
  recoveryUserId: string | null;
  refresh: () => Promise<void>;
};

const Ctx = createContext<AuthState>({ user: null, profile: null, isAdmin: false, loading: true, openedAuthLink: false, recoveryUserId: null, refresh: async () => {} });

export function AuthProvider({ children, onChange, authLink }: { children: ReactNode; onChange?: (event: string) => void; authLink?: AuthLinkResult | null }) {
  const [openedAuthLink, setOpenedAuthLink] = useState(!!authLink);
  const [recoveryUserId, setRecoveryUserId] = useState<string | null>(authLink?.ok && authLink.recovery ? authLink.userId ?? null : null);
  useEffect(() => {
    if (!authLink) return;
    setOpenedAuthLink(true);
    setRecoveryUserId(authLink.ok && authLink.recovery ? authLink.userId ?? null : null);
  }, [authLink]);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (u: User | null) => {
    setUser(u);
    if (!u) {
      setProfile(null);
      setIsAdmin(false);
      setLoading(false);
      return;
    }
    const [{ data: p }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("id, email, username, display_name, inbox_paused, searchable, suspended, bio, avatar_url").eq("id", u.id).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", u.id),
    ]);
    setProfile((p as Profile) ?? null);
    setIsAdmin(!!roles?.some((r) => r.role === "admin"));
    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (data.user && sessionExpired()) {
        localStorage.removeItem(STAMP);
        await supabase.auth.signOut();
        return load(null);
      }
      load(data.user ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") localStorage.removeItem(STAMP);
      if (event === "SIGNED_OUT") setRecoveryUserId(null);
      if (event === "PASSWORD_RECOVERY") setRecoveryUserId(session?.user.id ?? null);
      if (event === "SIGNED_IN" && !localStorage.getItem(STAMP)) localStorage.setItem(STAMP, String(Date.now()));
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED" || event === "PASSWORD_RECOVERY") {
        void load(session?.user ?? null);
        onChange?.(event);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [load, onChange]);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    await load(data.user);
  }, [load]);

  return <Ctx.Provider value={{ user, profile, isAdmin, loading, refresh, openedAuthLink, recoveryUserId }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
