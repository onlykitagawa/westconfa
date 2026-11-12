import { Eye, EyeOff } from "lucide-react";
import { useEffect, useState } from "react";
import { t } from "@/i18n";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { RESEND_COOLDOWN_SECONDS } from "@/lib/moderation";
import { Button } from "@/components/ui/button";

export function EmailField({ value, onChange, autoFocus, showHint }: { value: string; onChange: (v: string) => void; autoFocus?: boolean; showHint?: boolean }) {
  return (
    <div className="space-y-2">
      <Label htmlFor="email">{t.auth.email}</Label>
      <Input
        id="email" name="email" type="email" inputMode="email" autoComplete="username" autoCapitalize="none" spellCheck={false}
        autoFocus={autoFocus} className="h-[52px] rounded-2xl text-base" placeholder={t.auth.emailPlaceholder}
        value={value} onChange={(e) => onChange(e.target.value)} aria-describedby={showHint ? "email-hint" : undefined}
      />
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

export function CodeField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-2">
      <Label htmlFor="otp">{t.auth.code}</Label>
      <InputOTP
        id="otp" maxLength={6} value={value} onChange={(v) => onChange(v.replace(/\D/g, ""))} autoFocus
        inputMode="numeric" autoComplete="one-time-code" pattern="^[0-9]*$" containerClassName="justify-center"
      >
        <InputOTPGroup className="grid w-full max-w-xs grid-cols-6 gap-1.5 sm:gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <InputOTPSlot key={i} index={i} className="h-14 w-full min-w-0 rounded-xl border border-input bg-field text-xl font-semibold first:rounded-xl last:rounded-xl" />
          ))}
        </InputOTPGroup>
      </InputOTP>
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
