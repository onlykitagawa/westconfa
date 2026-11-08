import { Link, useNavigate } from "@tanstack/react-router";
import { Inbox, Settings, Share2, Shield } from "lucide-react";
import { useEffect, useState } from "react";
import { t } from "@/i18n";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./theme";
import { ShareDialog } from "./share-dialog";

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5 rounded-xl font-extrabold tracking-tight" aria-label={`${t.brand} home`}>
      <img src="/favicon.png" alt="" width={32} height={32} className="size-8 rounded-[10px] shadow-soft" />
      <span className="text-lg">{t.brand}</span>
    </Link>
  );
}

export function SiteHeader() {
  const { user, isAdmin, loading } = useAuth();
  const navLink = "rounded-xl px-3 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-accent";
  const active = { className: "text-foreground bg-accent" };
  return (
    <header className="sticky top-0 z-40">
      <div className="mx-auto flex h-18 max-w-6xl items-center justify-between gap-3 px-5 py-3">
        <Logo />
        <nav className="flex items-center gap-1" aria-label="Main">
          {!loading && user ? (
            <div className="hidden items-center gap-1 md:flex">
              <Link to="/inbox" className={navLink} activeProps={active}>{t.common.inbox}</Link>
              <Link to="/settings" className={navLink} activeProps={active}>{t.common.settings}</Link>
              {isAdmin && <Link to="/admin" className={navLink} activeProps={active}>{t.common.admin}</Link>}
            </div>
          ) : !loading ? (
            <Link to="/auth" className={navLink}>{t.common.signIn}</Link>
          ) : null}
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}

export function MobileNav() {
  const { profile, isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const item = "press flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-2xl text-xs font-semibold text-muted-foreground";
  const active = { className: "text-primary" };
  return (
    <>
      <nav aria-label="App" className="fixed inset-x-3 bottom-3 z-40 md:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="glass flex items-stretch gap-1 rounded-3xl p-1.5">
          <Link to="/inbox" className={item} activeProps={active}><Inbox className="size-5" />{t.common.inbox}</Link>
          <button type="button" className={item} onClick={() => setOpen(true)} disabled={!profile?.username}>
            <Share2 className="size-5" />{t.common.share}
          </button>
          {isAdmin && <Link to="/admin" className={item} activeProps={active}><Shield className="size-5" />{t.common.admin}</Link>}
          <Link to="/settings" className={item} activeProps={active}><Settings className="size-5" />{t.common.settings}</Link>
        </div>
      </nav>
      {profile?.username && <ShareDialog open={open} onOpenChange={setOpen} username={profile.username} />}
    </>
  );
}

export function Footer() {
  const l = "rounded-lg px-1 hover:text-foreground";
  return (
    <footer className="mx-auto mt-24 max-w-6xl px-5 pb-32 md:pb-12">
      <div className="flex flex-col gap-6 border-t pt-8 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
        <nav className="flex flex-wrap gap-x-5 gap-y-3" aria-label="Legal">
          <Link to="/privacy" className={l}>{t.footer.privacy}</Link>
          <Link to="/terms" className={l}>{t.footer.terms}</Link>
          <Link to="/guidelines" className={l}>{t.footer.guidelines}</Link>
          <Link to="/contact" className={l}>{t.footer.contact}</Link>
        </nav>
        <p className="max-w-sm">{t.footer.disclaimer}</p>
      </div>
    </footer>
  );
}

export function CookieNotice() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!localStorage.getItem("cookie-ok")) setShow(true);
  }, []);
  if (!show) return null;
  return (
    <div role="region" aria-label="Cookie notice" className="animate-rise fixed inset-x-3 bottom-24 z-50 mx-auto max-w-lg md:bottom-5">
      <div className="glass flex items-center gap-3 rounded-2xl py-2 pl-4 pr-2 text-sm">
        <p className="flex-1 text-muted-foreground">{t.cookie.text}</p>
        <Button size="sm" variant="secondary" onClick={() => { localStorage.setItem("cookie-ok", "1"); setShow(false); }}>
          {t.cookie.ok}
        </Button>
      </div>
    </div>
  );
}

export function useSignOut() {
  const navigate = useNavigate();
  return async (queryClient: { cancelQueries: () => Promise<void>; clear: () => void }) => {
    const { supabase } = await import("@/integrations/supabase/client");
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };
}
