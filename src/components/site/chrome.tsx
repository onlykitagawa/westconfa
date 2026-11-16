import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { Check, Inbox, LogOut, MessageSquare, Search, Settings as SettingsIcon, Share2, Shield, User } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
import { t } from "@/i18n";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ThemeToggle } from "./theme";
import { ShareDialog } from "./share-dialog";
import { UserAvatar } from "./avatar";
import { LanguageSelect } from "./language";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { badgeText, useAppBadge, useBadges } from "@/lib/inbox-data";
import { cn } from "@/lib/utils";
import { BUBBLE_PATH, W_PATH } from "./brand-mark";

export function Logo() {
  const { user } = useAuth();
  const gid = `brand-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <Link to={user ? "/inbox" : "/"} className="flex items-center gap-2.5 rounded-xl font-extrabold" aria-label={`${t.brand} home`}>
      <svg viewBox="0 0 64 64" className="size-9 shrink-0 drop-shadow-sm" aria-hidden="true">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" style={{ stopColor: "var(--brand-from)" }} />
            <stop offset="1" style={{ stopColor: "var(--brand-to)" }} />
          </linearGradient>
        </defs>
        <path d={BUBBLE_PATH} fill={`url(#${gid})`} />
        <path d={W_PATH} fill="none" stroke="var(--brand-foreground)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="text-lg">{t.brand}</span>
    </Link>
  );
}

// A small red count on a navigation item.
export function CountBadge({ n, className }: { n: number; className?: string }) {
  if (n <= 0) return null;
  return (
    <span className={cn("grid h-5 min-w-5 place-items-center rounded-full bg-destructive px-1.5 text-[11px] font-bold leading-none text-destructive-foreground tabular-nums", className)}>
      {badgeText(n)}
      <span className="sr-only"> {t.nav.newItems}</span>
    </span>
  );
}

// The avatar button with Profile, Settings and Sign out. Used on desktop and phones.
function AccountMenu() {
  const { profile, isAdmin } = useAuth();
  const qc = useQueryClient();
  const signOut = useSignOut();
  const navigate = useNavigate();
  const name = profile?.display_name || profile?.username || "";
  const item = "min-h-11 cursor-pointer rounded-xl text-[15px]";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={t.nav.account} className="press rounded-full outline-none focus-visible:ring-4 focus-visible:ring-ring/40">
          <UserAvatar url={profile?.avatar_url ?? null} name={name} className="size-10 text-base" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60 rounded-2xl p-1.5">
        <DropdownMenuLabel className="truncate px-3 py-2 font-normal">
          <span className="block truncate font-semibold">{name}</span>
          {profile?.username && <span className="block truncate text-xs text-muted-foreground">@{profile.username}</span>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem className={item} onSelect={() => navigate({ to: "/profile" })}><User /> {t.common.profile}</DropdownMenuItem>
        <DropdownMenuItem className={item} onSelect={() => navigate({ to: "/settings" })}><SettingsIcon /> {t.common.settings}</DropdownMenuItem>
        {isAdmin && <DropdownMenuItem className={item} onSelect={() => navigate({ to: "/admin" })}><Shield /> {t.common.admin}</DropdownMenuItem>}
        <DropdownMenuSeparator />
        <DropdownMenuItem className={item} onSelect={() => void signOut(qc)}><LogOut /> {t.common.signOut}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Sent messages live inside the Inbox page (the Inbox / Sent tabs), so there is one "Inbox" entry
// in the navigation. It is highlighted on both pages and its badge counts both.
function useMessagesNav() {
  const badges = useBadges();
  const { pathname } = useLocation();
  const path = pathname.replace(/\/+$/, "");
  return { total: badges.inbox + badges.sent, onMessages: path === "/inbox" || path === "/sent" };
}

function SignedInNav() {
  const { isAdmin } = useAuth();
  const { total, onMessages } = useMessagesNav();
  useAppBadge(total);
  // data-status="active" is set by the router on the current link; styling through it makes the
  // active colors win over the base ones.
  const navLink =
    "inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-accent data-[status=active]:bg-accent data-[status=active]:text-foreground";
  return (
    <>
      <div className="hidden items-center gap-1 md:flex">
        <Link to="/inbox" className={cn(navLink, onMessages && "bg-accent text-foreground")} aria-current={onMessages ? "page" : undefined}>
          {t.common.inbox} <CountBadge n={total} />
        </Link>
        <Link to="/search" className={navLink}>
          {t.common.search}
        </Link>
        {isAdmin && (
          <Link to="/admin" className={navLink}>
            {t.common.admin}
          </Link>
        )}
      </div>
      <ThemeToggle />
      <AccountMenu />
    </>
  );
}

export function SiteHeader() {
  const { user, loading } = useAuth();
  return (
    <header className="sticky top-0 z-40 border-b bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 py-2 sm:px-5">
        <Logo />
        <nav className="flex items-center gap-1.5" aria-label="Main">
          {!loading && user ? (
            <SignedInNav />
          ) : (
            <>
              {!loading && !user && (
                <Button asChild variant="glass" className="h-11 rounded-full px-5 text-sm font-semibold">
                  <Link to="/auth">{t.common.signIn}</Link>
                </Button>
              )}
              <ThemeToggle />
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

export function MobileNav() {
  const { profile, isAdmin } = useAuth();
  const { total, onMessages } = useMessagesNav();
  const [open, setOpen] = useState(false);
  const item =
    "press relative flex min-h-[58px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-[22px] px-1 text-[12px] font-semibold text-muted-foreground [&_svg]:size-5 data-[status=active]:bg-brand data-[status=active]:text-brand-foreground";
  return (
    <>
      <nav
        aria-label="App"
        className="fixed inset-x-3 bottom-3 z-40 md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="glass flex items-stretch gap-1 rounded-[30px] p-2">
          <Link to="/inbox" className={cn(item, onMessages && "bg-brand text-brand-foreground")} aria-current={onMessages ? "page" : undefined}>
            <Inbox className="size-5" />
            {t.common.inbox}
            <CountBadge n={total} className="absolute right-[calc(50%-1.35rem)] top-1.5" />
          </Link>
          <Link to="/search" className={item}>
            <Search className="size-5" />
            {t.common.search}
          </Link>
          <Button
            type="button"
            variant="ghost"
            className={item}
            onClick={() => setOpen(true)}
            disabled={!profile?.username}
          >
            <Share2 className="size-5" />
            {t.common.share}
          </Button>
          {isAdmin && (
            <Link to="/admin" className={item}>
              <Shield className="size-5" />
              {t.common.admin}
            </Link>
          )}
          <Link to="/profile" className={item}>
            <User className="size-5" />
            {t.common.profile}
          </Link>
        </div>
      </nav>
      {profile?.username && <ShareDialog open={open} onOpenChange={setOpen} username={profile.username} />}
    </>
  );
}

// Feedback. Saved into contact_messages (the admin "Contact" tab) with the name "Feedback · /page".
// No word filter or AI check here on purpose: only admins can read it. English-only for now.
const ANON_EMAIL = "anonymous@feedback.invalid";
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
let lastFeedbackAt = 0;

function FeedbackForm({ idPrefix }: { idPrefix: string }) {
  const F = t.feedback;
  const [body, setBody] = useState("");
  const [email, setEmail] = useState("");
  const [trap, setTrap] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = body.trim();
    const mail = email.trim();
    if (!text) return setErr(F.empty);
    if (mail && (!EMAIL_RE.test(mail) || mail.length > 254)) return setErr(F.badEmail);
    if (trap) return setDone(true); // bots fill the hidden field; pretend it worked
    if (Date.now() - lastFeedbackAt < 15000) return setErr(F.wait);
    setBusy(true);
    setErr(null);
    const page = typeof window !== "undefined" ? window.location.pathname : "/";
    const { error } = await supabase.from("contact_messages").insert({
      name: `Feedback · ${page}`.slice(0, 100),
      email: mail || ANON_EMAIL,
      body: text.slice(0, 2000),
    });
    setBusy(false);
    if (error) return setErr(t.common.somethingWrong);
    lastFeedbackAt = Date.now();
    setDone(true);
    setBody("");
    setEmail("");
  };

  if (done)
    return (
      <div className="py-4 text-center" role="status">
        <div className="animate-pop mx-auto grid size-14 place-items-center rounded-full bg-success/15 text-success">
          <Check className="size-7" />
        </div>
        <p className="mt-3 font-semibold">{F.thanks}</p>
        <Button type="button" variant="ghost" className="mt-2" onClick={() => setDone(false)}>
          {F.another}
        </Button>
      </div>
    );

  return (
    <form onSubmit={submit} noValidate className="space-y-4 text-left">
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-body`}>{F.label}</Label>
        <Textarea
          id={`${idPrefix}-body`}
          rows={4}
          maxLength={2000}
          className="rounded-2xl"
          placeholder={F.placeholder}
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            setErr(null);
          }}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-email`} className="font-normal text-muted-foreground">
          {F.emailLabel}
        </Label>
        <Input
          id={`${idPrefix}-email`}
          type="email"
          maxLength={254}
          className="h-12 rounded-2xl"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setErr(null);
          }}
        />
      </div>
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
        value={trap}
        onChange={(e) => setTrap(e.target.value)}
      />
      {err && (
        <p role="alert" className="text-sm text-destructive">
          {err}
        </p>
      )}
      <Button type="submit" variant="hero" className="w-full" disabled={busy}>
        {busy ? F.sending : F.button}
      </Button>
    </form>
  );
}

function FeedbackButton() {
  const F = t.feedback;
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="glass"
        className="h-11 rounded-full px-5 text-sm font-semibold"
        onClick={() => setOpen(true)}
      >
        <MessageSquare className="size-4" aria-hidden="true" /> {F.button}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-3xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">{F.dialogTitle}</DialogTitle>
            <DialogDescription>{F.dialogBody}</DialogDescription>
          </DialogHeader>
          <FeedbackForm idPrefix="fb-dialog" />
        </DialogContent>
      </Dialog>
    </>
  );
}

export function Footer() {
  const l = "rounded-lg px-1 hover:text-foreground";
  const { pathname } = useLocation();
  // People sending a message (or checking one) are guests; keep their pages calm.
  const guestPage = pathname.startsWith("/u/") || pathname.startsWith("/m/");
  return (
    <footer className="mx-auto mt-24 max-w-6xl px-5 pb-32 md:pb-12">
      {!guestPage && (
        <div className="flex justify-center pb-8">
          <FeedbackButton />
        </div>
      )}
      <div className="flex flex-col gap-6 border-t pt-8 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
        <nav className="flex flex-wrap gap-x-5 gap-y-3" aria-label="Legal">
          <Link to="/privacy" className={l}>
            {t.footer.privacy}
          </Link>
          <Link to="/terms" className={l}>
            {t.footer.terms}
          </Link>
          <Link to="/guidelines" className={l}>
            {t.footer.guidelines}
          </Link>
          <Link to="/contact" className={l}>
            {t.footer.contact}
          </Link>
        </nav>
        <div className="flex flex-col gap-4 md:items-end">
          <LanguageSelect />
          <p className="max-w-sm">{t.footer.disclaimer}</p>
        </div>
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
    <div
      role="region"
      aria-label="Cookie notice"
      className="cookie-notice animate-rise fixed inset-x-3 z-50 max-w-sm md:left-5 md:right-auto"
    >
      <div className="glass flex items-center gap-3 rounded-2xl py-2 pl-4 pr-2 text-sm">
        <p className="flex-1 text-muted-foreground">{t.cookie.text}</p>
        <Button
          size="sm"
          variant="secondary"
          className="shrink-0"
          onClick={() => {
            localStorage.setItem("cookie-ok", "1");
            setShow(false);
          }}
        >
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
