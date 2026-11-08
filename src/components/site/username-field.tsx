import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { t } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { isValidUsername } from "@/lib/moderation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type UsernameStatus = "idle" | "invalid" | "checking" | "taken" | "ok";

export function UsernameField({ value, onChange, onStatus, current }: { value: string; onChange: (v: string) => void; onStatus: (s: UsernameStatus) => void; current?: string | null }) {
  const [status, setStatus] = useState<UsernameStatus>("idle");
  useEffect(() => {
    let cancelled = false;
    const set = (s: UsernameStatus) => { if (!cancelled) { setStatus(s); onStatus(s); } };
    if (!value) return set("idle");
    if (value === current) return set("ok");
    if (!isValidUsername(value)) return set("invalid");
    set("checking");
    const id = setTimeout(async () => {
      const { data } = await supabase.rpc("is_username_available", { _username: value });
      set(data ? "ok" : "taken");
    }, 350);
    return () => { cancelled = true; clearTimeout(id); };
  }, [value, current, onStatus]);

  const msg = status === "invalid" ? t.onboarding.invalid : status === "taken" ? t.onboarding.taken : status === "ok" && value !== current ? t.onboarding.available : t.onboarding.usernameHint;
  return (
    <div className="space-y-2">
      <Label htmlFor="username">{t.onboarding.username}</Label>
      <div className="relative">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">@</span>
        <Input
          id="username" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={20}
          className="h-12 rounded-2xl pl-9 pr-10 text-base"
          value={value} onChange={(e) => onChange(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
          aria-describedby="username-hint" aria-invalid={status === "invalid" || status === "taken"}
        />
        <span className="absolute right-4 top-1/2 -translate-y-1/2">
          {status === "ok" && <Check className="size-5 text-success" />}
          {(status === "taken" || status === "invalid") && <X className="size-5 text-destructive" />}
        </span>
      </div>
      <p id="username-hint" className={status === "taken" || status === "invalid" ? "text-sm text-destructive" : status === "ok" && value !== current ? "text-sm text-success" : "text-sm text-muted-foreground"}>{msg}</p>
    </div>
  );
}
