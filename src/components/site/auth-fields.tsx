import { ExternalLink, Eye, EyeOff, Mail } from "lucide-react";
import { useEffect, useState } from "react";
import { t } from "@/i18n";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RESEND_COOLDOWN_SECONDS } from "@/lib/moderation";
import { Button } from "@/components/ui/button";

const DOMAIN = "students.wiut.uz";

// Offers to finish the address when someone types only the first part, or part of the domain.
function suggestEmail(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  if (v.length < 2 || /\s/.test(v)) return null;
  const at = v.indexOf("@");
  if (at === -1) return `${v}@${DOMAIN}`;
  const local = v.slice(0, at);
  const domain = v.slice(at + 1);
  if (!local || domain === DOMAIN || domain.includes("@")) return null;
  return DOMAIN.startsWith(domain) && domain !== "" ? `${local}@${DOMAIN}` : null;
}

// A visible "which email?" box with a button that opens Outlook, where the student email is shown.
export function EmailHelp() {
  return (
    <div className="mt-6 rounded-[22px] border border-primary/15 bg-accent p-4">
      <p className="flex items-center gap-2 font-semibold text-accent-foreground">
        <Mail className="size-4 shrink-0" aria-hidden="true" /> {t.auth.helpTitle}
      </p>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{t.auth.helpBody}</p>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{t.auth.helpFind}</p>
      <Button asChild variant="secondary" size="sm" className="mt-3 h-10 rounded-xl">
        <a href="https://outlook.office.com/mail/" target="_blank" rel="noopener noreferrer"><ExternalLink /> {t.auth.helpOpen}</a>
      </Button>
      <p className="mt-2 text-xs text-muted-foreground">{t.auth.helpNotChat}</p>
    </div>
  );
}

export function EmailField({ value, onChange, autoFocus, showHint }: { value: string; onChange: (v: string) => void; autoFocus?: boolean; showHint?: boolean }) {
  const suggestion = suggestEmail(value);
  return (
    <div className="space-y-2">
      <Label htmlFor="email">{t.auth.email}</Label>
      <Input
        id="email" name="email" type="email" inputMode="email" autoComplete="username" autoCapitalize="none" spellCheck={false}
        autoFocus={autoFocus} className="h-[52px] rounded-2xl text-base" placeholder={t.auth.emailPlaceholder}
        value={value} onChange={(e) => onChange(e.target.value)} aria-describedby={showHint ? "email-hint" : undefined}
      />
      {suggestion && (
        <button
          type="button"
          onClick={() => onChange(suggestion)}
          className="press inline-flex max-w-full items-center rounded-full bg-accent px-3 py-1.5 text-sm font-semibold text-accent-foreground"
        >
          <span className="truncate">{t.auth.suggestUse(suggestion)}</span>
        </button>
      )}
      {showHint && <p id="email-hint" className="text-sm text-muted-foreground">{t.auth.emailHint}</p>}
    </div>
  );
}

export function PasswordField({ value, onChange, isNew, label, id = "password" }: { value: string; onChange: (v: string) => void; isNew?: boolean; label?: string; id?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label ?? t.auth.password}</Label>
      <div className="relative">
        <Input
          id={id} name={isNew ? "new-password" : "password"} type={show ? "text" : "password"}
          autoComplete={isNew ? "new-password" : "current-password"} minLength={isNew ? 8 : undefined}
          className="h-[52px] rounded-2xl pr-14 text-base" value={value} onChange={(e) => onChange(e.target.value)}
          aria-describedby={isNew ? `${id}-hint` : undefined}
        />
        <Button variant="ghost"
          type="button" onClick={() => setShow((s) => !s)}
          aria-label={show ? t.auth.hidePassword : t.auth.showPassword} aria-pressed={show}
          className="absolute right-1 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-xl text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
        </Button>
      </div>
      {isNew && <p id={`${id}-hint`} className="text-sm text-muted-foreground">{t.auth.passwordHint}</p>}
    </div>
  );
}

// Codes from sign-in emails. Their length is set by the sign-in service (it has been 6, and may be
// 8), so the box takes any 6 to 10 digits instead of a fixed number of slots.
export const CODE_MIN = 6;
export const CODE_MAX = 10;
export const codeReady = (code: string) => code.length >= CODE_MIN && code.length <= CODE_MAX;

export function CodeField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-2">
      <Label htmlFor="otp">{t.auth.code}</Label>
      <input
        id="otp"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, CODE_MAX))}
        onPaste={(e) => {
          const digits = e.clipboardData.getData("text").replace(/\D/g, "");
          if (digits) {
            e.preventDefault();
            onChange(digits.slice(0, CODE_MAX));
          }
        }}
        autoFocus
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={CODE_MAX}
        placeholder="••••••"
        className="h-16 w-full rounded-2xl border border-input bg-field px-4 text-center font-mono text-3xl font-semibold tracking-[0.3em] outline-none transition placeholder:text-muted-foreground/50 focus:border-ring focus:ring-4 focus:ring-ring/30"
      />
    </div>
  );
}

export function ResendButton({ onResend }: { onResend: () => Promise<void> }) {
  const [left, setLeft] = useState(RESEND_COOLDOWN_SECONDS);
  useEffect(() => {
    if (left <= 0) return;
    const id = setTimeout(() => setLeft((l) => l - 1), 1000);
    return () => clearTimeout(id);
  }, [left]);
  return (
    <Button type="button" variant="ghost" className="w-full" disabled={left > 0}
      onClick={async () => { setLeft(RESEND_COOLDOWN_SECONDS); await onResend(); }}>
      {left > 0 ? t.auth.resendIn(left) : t.auth.resend}
    </Button>
  );
}
