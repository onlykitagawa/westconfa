import { Check, Copy, Share2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { t } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// The public address people should open. Change this when a custom domain is connected.
const PUBLIC_SITE_URL = "https://westconfa.lovable.app";

// Inside the Lovable editor the page runs on a private preview address that makes visitors
// log in to Lovable first. That address must never end up in a link someone else opens.
export function shareOrigin() {
  const { origin, hostname } = window.location;
  const isPrivatePreview = hostname.startsWith("id-preview--") || hostname.endsWith(".lovableproject.com");
  return isPrivatePreview ? PUBLIC_SITE_URL : origin;
}

export function useProfileLink(username: string) {
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(shareOrigin()), []);
  return `${origin}/u/${username}`;
}

export function ShareDialog({
  open,
  onOpenChange,
  username,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  username: string;
}) {
  const link = useProfileLink(username);
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  useEffect(() => setCanShare(typeof navigator !== "undefined" && !!navigator.share), []);

  const copy = async () => {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success(t.shareDialog.copied);
    setTimeout(() => setCopied(false), 1800);
  };
  const share = async () => {
    try {
      await navigator.share({ title: t.brand, text: t.shareDialog.shareText, url: link });
    } catch {
      /* user cancelled */
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">{t.shareDialog.title}</DialogTitle>
          <DialogDescription>{t.shareDialog.body}</DialogDescription>
        </DialogHeader>
        <div className="mx-auto my-2 rounded-3xl bg-qr-surface p-4 shadow-soft">
          <QRCodeSVG
            value={link || " "}
            size={180}
            level="M"
            bgColor="var(--qr-surface)"
            fgColor="var(--qr-ink)"
            aria-label="QR code for your link"
          />
        </div>
        <div className="truncate rounded-2xl border bg-muted px-4 py-3 text-center font-mono text-sm">
          {link.replace(/^https?:\/\//, "")}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button onClick={copy} variant={canShare ? "secondary" : "hero"} className={canShare ? "" : "sm:col-span-2"}>
            {copied ? <Check /> : <Copy />} {t.shareDialog.copy}
          </Button>
          {canShare && (
            <Button onClick={share} variant="hero">
              <Share2 /> {t.shareDialog.nativeShare}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
