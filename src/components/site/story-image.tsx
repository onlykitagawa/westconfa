import { ImageDown } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { t } from "@/i18n";
import { Button } from "@/components/ui/button";

// A 1080x1920 picture for Instagram / Telegram stories: headline, QR code, @username and the link.
// Drawn on a canvas in the browser; nothing is uploaded. Colors are fixed hex values because CSS
// variables don't exist inside the exported image.
const W = 1080;
const H = 1920;
const NAVY = "#1c2a5c";
const BLUE = "#3b58cc";
const CARAMEL = "#e2b480";
const INK = "#1c2a5c";
const GREY = "#5a6694";

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function svgToImage(svg: SVGSVGElement): Promise<HTMLImageElement | null> {
  const xml = new XMLSerializer().serializeToString(svg);
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

async function drawStory(qr: SVGSVGElement, username: string, link: string): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  try {
    await Promise.all([document.fonts.load("800 110px Onest"), document.fonts.load("600 40px Onest")]);
  } catch {
    // fall back to the system font
  }
  const font = (weight: number, size: number) => `${weight} ${size}px Onest, system-ui, sans-serif`;

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, NAVY);
  bg.addColorStop(1, BLUE);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  // soft glow
  const glow = ctx.createRadialGradient(W * 0.85, H * 0.15, 0, W * 0.85, H * 0.15, 700);
  glow.addColorStop(0, "rgba(226,180,128,0.35)");
  glow.addColorStop(1, "rgba(226,180,128,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = CARAMEL;
  ctx.font = font(700, 46);
  ctx.fillText(t.brand, W / 2, 200);

  ctx.fillStyle = "#ffffff";
  ctx.font = font(800, 110);
  const lines = wrap(ctx, t.shareDialog.storyHeadline, 900);
  lines.forEach((l, i) => ctx.fillText(l, W / 2, 400 + i * 124));

  const cardY = 400 + lines.length * 124 + 40;
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, 150, cardY, 780, 820, 64);
  ctx.fill();

  const img = await svgToImage(qr);
  if (img) ctx.drawImage(img, 250, cardY + 70, 580, 580);
  ctx.fillStyle = INK;
  ctx.font = font(800, 60);
  ctx.fillText(`@${username}`, W / 2, cardY + 730);
  ctx.fillStyle = GREY;
  ctx.font = font(600, 34);
  ctx.fillText(link.replace(/^https?:\/\//, ""), W / 2, cardY + 785, 700);

  ctx.fillStyle = CARAMEL;
  ctx.font = font(600, 42);
  wrap(ctx, t.shareDialog.storyFooter, 900).forEach((l, i) => ctx.fillText(l, W / 2, H - 170 + i * 54));

  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

export function StoryButton({ username, link }: { username: string; link: string }) {
  const holder = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);

  const make = async () => {
    const svg = holder.current?.querySelector("svg");
    if (!svg || !link) return;
    setBusy(true);
    try {
      const blob = await drawStory(svg, username, link);
      if (!blob) throw new Error("no image");
      const file = new File([blob], `wconfa-${username}.png`, { type: "image/png" });
      if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: t.brand, text: t.shareDialog.shareText });
          return;
        } catch (e) {
          if (e instanceof DOMException && e.name === "AbortError") return;
          // sharing files failed: fall back to downloading
        }
      }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(file);
      a.download = file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast.success(t.shareDialog.storySaved);
    } catch {
      toast.error(t.common.somethingWrong);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div ref={holder} className="hidden" aria-hidden="true">
        <QRCodeSVG value={link || " "} size={580} level="M" bgColor="#ffffff" fgColor={INK} />
      </div>
      <Button type="button" variant="glass" className="w-full" onClick={make} disabled={busy || !link}>
        <ImageDown /> {busy ? t.shareDialog.storyMaking : t.shareDialog.story}
      </Button>
      <p className="text-center text-xs text-muted-foreground">{t.shareDialog.storyTip}</p>
    </>
  );
}
