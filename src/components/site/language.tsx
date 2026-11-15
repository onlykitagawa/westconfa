import { Globe } from "lucide-react";
import { changeLang, lang, LANGS, t, type Lang } from "@/i18n";
import { cn } from "@/lib/utils";

// English / Русский / O‘zbekcha. The choice is saved on this device and the page reloads in it.
export function LanguageSelect({ className }: { className?: string }) {
  return (
    <label className={cn("inline-flex items-center gap-2 rounded-xl text-sm text-muted-foreground", className)}>
      <Globe className="size-4 shrink-0" aria-hidden="true" />
      <span className="sr-only">{t.common.language}</span>
      <select
        value={lang}
        onChange={(e) => changeLang(e.target.value as Lang)}
        className="h-10 cursor-pointer rounded-xl border border-input bg-field px-3 text-sm font-semibold text-foreground outline-none focus-visible:ring-4 focus-visible:ring-ring/30"
      >
        {LANGS.map((l) => (
          <option key={l.code} value={l.code}>{l.label}</option>
        ))}
      </select>
    </label>
  );
}

// Three big buttons for the Settings page.
export function LanguageButtons() {
  return (
    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t.common.language}>
      {LANGS.map((l) => (
        <button
          key={l.code}
          type="button"
          role="radio"
          aria-checked={lang === l.code}
          onClick={() => lang !== l.code && changeLang(l.code)}
          className={cn(
            "press h-12 rounded-2xl border px-2 text-sm font-semibold",
            lang === l.code ? "border-transparent bg-brand text-brand-foreground" : "bg-field hover:bg-accent",
          )}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
