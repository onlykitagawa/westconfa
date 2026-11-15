import { useServerFn } from "@tanstack/react-start";
import { Camera, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { t } from "@/i18n";
import { AVATAR_MAX_BYTES, AVATAR_SIZE, bytesToBase64, clampOffset, coverScale, sourceRect } from "@/lib/avatar-image";
import { uploadAvatar } from "@/lib/avatar.functions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const VIEW = 256;
const MAX_ZOOM = 3;
const MAX_FILE_BYTES = 25 * 1024 * 1024;

type Picked = { el: HTMLImageElement; url: string; w: number; h: number };

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => resolve(null);
    el.src = url;
  });
}

// Draws the chosen square onto a 512 px canvas and saves it as JPEG. Re-drawing is what removes
// EXIF data (location, camera) from the original photo. Quality drops until it fits the size cap.
async function renderJpeg(el: HTMLImageElement, rect: { sx: number; sy: number; size: number }): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(el, rect.sx, rect.sy, rect.size, rect.size, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
  for (const quality of [0.86, 0.72, 0.6, 0.45]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size <= AVATAR_MAX_BYTES) return blob;
  }
  return null;
}

// Pick a photo, drag and zoom it inside a circle, save. The server does the safety check.
export function AvatarEditor({ open, onOpenChange, onDone, onRemove }: { open: boolean; onOpenChange: (open: boolean) => void; onDone: () => void; onRemove?: (() => Promise<void>) | undefined }) {
  const A = t.avatar;
  const upload = useServerFn(uploadAvatar);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setPicked(null);
      setError(null);
      setBusy(false);
    }
  }, [open]);
  useEffect(() => {
    const url = picked?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [picked]);

  const scale = picked ? coverScale(picked.w, picked.h, VIEW) * zoom : 1;
  const shownW = picked ? picked.w * scale : 0;
  const shownH = picked ? picked.h * scale : 0;
  const x = clampOffset(pos.x, shownW, VIEW);
  const y = clampOffset(pos.y, shownH, VIEW);

  const choose = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    if (!file.type.startsWith("image/") || file.size > MAX_FILE_BYTES) {
      setError(A.errors.unreadable);
      return;
    }
    const url = URL.createObjectURL(file);
    const el = await loadImage(url);
    if (!el || Math.min(el.naturalWidth, el.naturalHeight) < 64) {
      URL.revokeObjectURL(url);
      setError(A.errors.unreadable);
      return;
    }
    const s = coverScale(el.naturalWidth, el.naturalHeight, VIEW);
    setZoom(1);
    setPos({ x: (VIEW - el.naturalWidth * s) / 2, y: (VIEW - el.naturalHeight * s) / 2 });
    setPicked({ el, url, w: el.naturalWidth, h: el.naturalHeight });
  };

  const changeZoom = (next: number) => {
    if (!picked) return;
    // Zoom around the centre of the circle.
    const ratio = next / zoom;
    const c = VIEW / 2;
    const nextScale = coverScale(picked.w, picked.h, VIEW) * next;
    setPos({
      x: clampOffset(c - (c - x) * ratio, picked.w * nextScale, VIEW),
      y: clampOffset(c - (c - y) * ratio, picked.h * nextScale, VIEW),
    });
    setZoom(next);
  };

  const save = async () => {
    if (!picked) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await renderJpeg(picked.el, sourceRect(picked.w, picked.h, VIEW, zoom, x, y));
      if (!blob) {
        setError(A.errors.unreadable);
        return;
      }
      const res = await upload({ data: { image: bytesToBase64(new Uint8Array(await blob.arrayBuffer())) } });
      if (res.ok) {
        toast.success(A.saved);
        onDone();
        onOpenChange(false);
      } else setError(A.errors[res.code]);
    } catch {
      setError(A.errors.generic);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-sm rounded-[28px]">
        <DialogHeader>
          <DialogTitle>{A.title}</DialogTitle>
          <DialogDescription>{A.rules}</DialogDescription>
        </DialogHeader>
        <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={choose} aria-label={A.choose} />

        {picked ? (
          <div className="space-y-4">
            <div
              className="relative mx-auto touch-none select-none overflow-hidden rounded-full bg-muted ring-4 ring-background"
              style={{ width: VIEW, height: VIEW }}
              tabIndex={0}
              role="img"
              aria-label={A.dragHint}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                drag.current = { px: e.clientX, py: e.clientY, x, y };
              }}
              onPointerMove={(e) => {
                const d = drag.current;
                if (!d) return;
                setPos({ x: clampOffset(d.x + e.clientX - d.px, shownW, VIEW), y: clampOffset(d.y + e.clientY - d.py, shownH, VIEW) });
              }}
              onPointerUp={() => { drag.current = null; }}
              onPointerCancel={() => { drag.current = null; }}
              onKeyDown={(e) => {
                const step = 12;
                const dx = e.key === "ArrowLeft" ? step : e.key === "ArrowRight" ? -step : 0;
                const dy = e.key === "ArrowUp" ? step : e.key === "ArrowDown" ? -step : 0;
                if (!dx && !dy) return;
                e.preventDefault();
                setPos({ x: clampOffset(x + dx, shownW, VIEW), y: clampOffset(y + dy, shownH, VIEW) });
              }}
            >
              <img
                src={picked.url}
                alt=""
                draggable={false}
                className="pointer-events-none absolute left-0 top-0 max-w-none"
                style={{ width: shownW, height: shownH, transform: `translate(${x}px, ${y}px)` }}
              />
            </div>
            <p className="text-center text-xs text-muted-foreground">{A.dragHint}</p>
            <input
              type="range"
              min={1}
              max={MAX_ZOOM}
              step={0.01}
              value={zoom}
              onChange={(e) => changeZoom(Number(e.target.value))}
              aria-label={A.zoom}
              className="h-11 w-full accent-primary"
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="press mx-auto grid w-full place-items-center gap-2 rounded-[24px] border-2 border-dashed border-input bg-field px-6 py-10 text-center hover:bg-accent/40"
          >
            <Camera className="size-8 text-muted-foreground" aria-hidden="true" />
            <span className="font-semibold">{A.choose}</span>
            <span className="text-sm text-muted-foreground">{A.formats}</span>
          </button>
        )}

        <p role="alert" className="min-h-5 text-center text-sm text-destructive">{error}</p>
        {!picked && <p className="text-center text-xs text-muted-foreground">{A.publicNote}</p>}
        {!picked && onRemove && (
          <Button
            type="button"
            variant="ghost"
            className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onRemove();
                onOpenChange(false);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Trash2 /> {A.remove}
          </Button>
        )}

        {picked && (
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="secondary" disabled={busy} onClick={() => fileInput.current?.click()}>{A.another}</Button>
            <Button type="button" variant="hero" disabled={busy} onClick={save}>{busy ? A.checking : t.common.save}</Button>
          </div>
        )}
        {busy && <p className="text-center text-xs text-muted-foreground" role="status">{A.checkingNote}</p>}
      </DialogContent>
    </Dialog>
  );
}
