import { Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { t } from "@/i18n";
import { Button } from "@/components/ui/button";

// A dismissible tip on phones: add west confa to the home screen so it opens like an app.
// Android Chrome may offer its own install prompt; iPhone needs the Share > Add to Home Screen steps.
type InstallEvent = Event & { prompt: () => Promise<void> };
const KEY = "wc_install_hint_closed";

let deferred: InstallEvent | null = null;
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallEvent;
  });
}

export function InstallHint() {
  const [show, setShow] = useState(false);
  const [platform, setPlatform] = useState<"ios" | "android" | null>(null);
  const [canPrompt, setCanPrompt] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(KEY)) return;
    } catch {
      return;
    }
    const nav = navigator as Navigator & { standalone?: boolean };
    const standalone = window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
    if (standalone || window.innerWidth >= 768) return;
    const ua = navigator.userAgent;
    const p = /iPhone|iPad|iPod/i.test(ua) ? "ios" : /Android/i.test(ua) ? "android" : null;
    if (!p) return;
    setPlatform(p);
    setCanPrompt(!!deferred);
    setShow(true);
    const onPrompt = () => setCanPrompt(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const close = () => {
    setShow(false);
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      // ignore
    }
  };

  if (!show || !platform) return null;
  const T = t.install;
  return (
    <div className="glass animate-rise relative mt-5 rounded-2xl p-4 pr-12" role="note">
      <button type="button" onClick={close} aria-label={T.close} className="absolute right-2 top-2 grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-accent">
        <X className="size-4" />
      </button>
      <p className="flex items-center gap-2 font-semibold"><Plus className="size-4" aria-hidden="true" /> {T.title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{platform === "ios" ? T.ios : T.android}</p>
      {canPrompt && platform === "android" && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="mt-3 h-10 rounded-xl"
          onClick={async () => {
            const ev = deferred;
            deferred = null;
            setCanPrompt(false);
            if (ev) await ev.prompt().catch(() => {});
            close();
          }}
        >
          {T.install}
        </Button>
      )}
    </div>
  );
}
