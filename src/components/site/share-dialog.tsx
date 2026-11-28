import { Check, Copy, Link2, Share2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { t } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StoryButton } from "./story-image";
import { markLinkShared } from "@/lib/link-shared";
export { linkWasShared } from "@/lib/link-shared";

// The public address people should open (custom domain connected Nov 20, 2026).
import { SITE_URL as PUBLIC_SITE_URL } from "@/lib/site";

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

export const shortLink = (link: string) => link.replace(/^https?:\/\//, "");

// Copy and native share for a link, shared by every place that offers the personal link.
export function useCopyShare(link: string) {
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  useEffect(() => setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function"), []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      markLinkShared();
      toast.success(t.shareDialog.copied);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error(t.common.somethingWrong);
    }
  };
  const share = async () => {
    try {
      await navigator.share({ title: t.brand, text: t.shareDialog.shareText, url: link });
      markLinkShared();
    } catch {
      /* user cancelled */
    }
  };
  return { copied, canShare, copy, share };
}

// A slim bar with the personal link and a one-tap Copy button (top of the inbox).
export function LinkBar({ username }: { username: string }) {
  const link = useProfileLink(username);
  const { copied, copy } = useCopyShare(link);
  return (
    <div className="glass mt-5 flex items-center gap-3 rounded-2xl py-2 pl-4 pr-2">
      <Link2 className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate font-mono text-sm" title={link}>{shortLink(link)}</span>
      <Button type="button" variant="secondary" size="sm" className="h-10 shrink-0 rounded-xl px-4" onClick={copy}>
        {copied ? <Check /> : <Copy />} {t.shareDialog.copyShort}
      </Button>
    </div>
  );
}

// QR code, the link, Copy, Share and the story image. Used by the share dialog and the
// "your link is ready" screen.
export function LinkPanel({ username }: { username: string }) {
  const link = useProfileLink(username);
  const { copied, canShare, copy, share } = useCopyShare(link);
  return (
    <div className="space-y-3">
      <div className="mx-auto w-fit rounded-3xl bg-qr-surface p-4 shadow-soft">
        <QRCodeSVG value={link || " "} size={168} level="M" bgColor="var(--qr-surface)" fgColor="var(--qr-ink)" aria-label={t.shareDialog.qrLabel} />
      </div>
      <div className="truncate rounded-2xl border bg-muted px-4 py-3 text-center font-mono text-sm">{shortLink(link)}</div>
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
      <StoryButton username={username} link={link} />
    </div>
  );
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-3xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">{t.shareDialog.title}</DialogTitle>
          <DialogDescription>{t.shareDialog.body}</DialogDescription>
        </DialogHeader>
        <LinkPanel username={username} />
      </DialogContent>
    </Dialog>
  );
}
