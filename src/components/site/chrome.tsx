import { Link, useNavigate } from "@tanstack/react-router";
import { Check, Inbox, MessageSquare, Search, Share2, Shield, User } from "lucide-react";
import { useEffect, useState } from "react";
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

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5 rounded-xl font-extrabold" aria-label={`${t.brand} home`}>
      <span
        className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand text-brand-foreground shadow-soft"
        aria-hidden
      >
        <svg viewBox="0 0 48 48" className="size-[22px]" aria-hidden="true">
          <path
            d="M22 4h18a6 6 0 0 1 6 6v9a6 6 0 0 1-6 6h-1v6l-6-6H22a6 6 0 0 1-6-6v-9a6 6 0 0 1 6-6z"
            fill="var(--caramel)"
          />
          <g transform="translate(2 12) scale(0.78)">
            <path
              d="M10 5h28a6 6 0 0 1 6 6v18a6 6 0 0 1-6 6H22l-9 8v-8h-3a6 6 0 0 1-6-6V11a6 6 0 0 1 6-6z"
              fill="var(--brand-foreground)"
              stroke="var(--brand-ink)"
              strokeWidth="3.5"
              strokeLinejoin="round"
              className="[paint-order:stroke]"
            />
            <path
              d="M13.5 15.5l4.2 12 6.3-11.5 6.3 11.5 4.2-12"
              fill="none"
              stroke="var(--brand-ink)"
              strokeWidth="3.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        </svg>
      </span>
      <span className="text-lg">{t.brand}</span>
    </Link>
  );
}

export function SiteHeader() {
  const { user, isAdmin, loading } = useAuth();
  const navLink =
    "rounded-xl px-3 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-accent";
  const active = { className: "text-foreground bg-accent" };
  return (
    <header className="sticky top-0 z-40 border-b bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 py-2 sm:px-5">
        <Logo />
        <nav className="flex items-center gap-1" aria-label="Main">
          {!loading && user ? (
            <>
              <Link to="/inbox" className={`${navLink} md:hidden`}>
                {t.common.openInbox}
              </Link>
              <div className="hidden items-center gap-1 md:flex">
                <Link to="/inbox" className={navLink} activeProps={active}>
                  {t.common.inbox}
                </Link>
                <Link to="/sent" className={navLink} activeProps={active}>
                  {t.common.sent}
                </Link>
                <Link to="/profile" className={navLink} activeProps={active}>
                  {t.common.profile}
                </Link>
                <Link to="/search" className={navLink} activeProps={active}>
                  {t.common.search}
                </Link>
                <Link to="/settings" className={navLink} activeProps={active}>
                  {t.common.settings}
                </Link>
                {isAdmin && (
                  <Link to="/admin" className={navLink} activeProps={active}>
                    {t.common.admin}
                  </Link>
                )}
              </div>
            </>
          ) : !loading ? (
            <Button asChild variant="glass" className="h-11 rounded-full px-5 text-sm font-semibold">
              <Link to="/auth">{t.common.signIn}</Link>
            </Button>
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
  const item =
    "press flex min-h-[58px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-[22px] px-1 text-[12px] font-semibold text-muted-foreground [&_svg]:size-5";
  const active = { className: "bg-brand text-brand-foreground" };
  return (
    <>
      <nav
        aria-label="App"
        className="fixed inset-x-3 bottom-3 z-40 md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="glass flex items-stretch gap-1 rounded-[30px] p-2">
          <Link to="/inbox" className={item} activeProps={active}>
            <Inbox className="size-5" />
            {t.common.inbox}
          </Link>
          <Link to="/search" className={item} activeProps={active}>
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
            <Link to="/admin" className={item} activeProps={active}>
              <Shield className="size-5" />
              {t.common.admin}
            </Link>
          )}
          <Link to="/profile" className={item} activeProps={active}>
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
const F = {
  button: "Send feedback",
  dialogTitle: "Share your feedback",
  dialogBody: "Tell us what's confusing, broken or missing, or what you like. Every note is read by the team.",
  sectionTitle: "Help us make west confa better",
  sectionBody:
    "We're a small student project, so every bit of feedback really helps: ideas, bugs, things you love or hate. It goes straight to the people building this.",
  label: "Your feedback",
  placeholder: "What should we fix, add or keep?",
  emailLabel: "Email (optional, only if you'd like a reply)",
  sending: "Sending…",
  thanks: "Thank you! Your feedback reached us.",
  another: "Send more",
  empty: "Please write something first.",
  badEmail: "That email doesn't look right. Leave it empty to stay anonymous.",
  wait: "Thanks! Please wait a few seconds before sending more.",
};
const ANON_EMAIL = "anonymous@feedback.invalid";
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
let lastFeedbackAt = 0;

function FeedbackForm({ idPrefix }: { idPrefix: string }) {
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

// The bigger feedback block for the landing page.
export function FeedbackSection() {
  return (
    <section className="mx-auto max-w-2xl px-5 py-16 md:py-24" aria-labelledby="feedback">
      <div className="glass rounded-[32px] p-7 md:p-10">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-accent text-accent-foreground">
          <MessageSquare className="size-6" aria-hidden="true" />
        </span>
        <h2 id="feedback" className="mt-5 text-center text-3xl font-extrabold md:text-4xl">
          {F.sectionTitle}
        </h2>
        <p className="mx-auto mt-3 max-w-md text-center leading-relaxed text-muted-foreground">{F.sectionBody}</p>
        <div className="mt-8">
          <FeedbackForm idPrefix="fb-section" />
        </div>
      </div>
    </section>
  );
}

function FeedbackButton() {
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
  return (
    <footer className="mx-auto mt-24 max-w-6xl px-5 pb-32 md:pb-12">
      <div className="flex justify-center pb-8">
        <FeedbackButton />
      </div>
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
