// Pure helpers for profile photos. The browser crops and shrinks the picture; the server never
// trusts that and re-checks the bytes with these same functions before anything is stored.

export const AVATAR_SIZE = 512;
export const AVATAR_MAX_BYTES = 200_000;
export const AVATAR_BASE64_MAX = Math.ceil((AVATAR_MAX_BYTES * 4) / 3) + 8;
export const AVATAR_MIN_SIDE = 64;
export const AVATAR_MAX_SIDE = 1024;

export function bytesToBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(out);
}

export function base64ToBytes(b64: string): Uint8Array | null {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return null;
  try {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

export type CleanJpeg = { bytes: Uint8Array; width: number; height: number };

// Walks a JPEG segment by segment. It keeps only what is needed to draw the picture and drops
// every metadata segment (EXIF with GPS and camera details, XMP, comments), so a photo sent by a
// hand-made client is as clean as one made by our own cropper. Returns null for anything that is
// not a well-formed baseline or progressive JPEG.
export function cleanJpeg(input: Uint8Array): CleanJpeg | null {
  const at = (k: number) => input[k] ?? 0;
  if (input.length < 4 || at(0) !== 0xff || at(1) !== 0xd8) return null;
  const parts: Uint8Array[] = [input.subarray(0, 2)];
  let width = 0;
  let height = 0;
  let sawFrame = false;
  let i = 2;
  while (i + 1 < input.length) {
    if (at(i) !== 0xff) return null;
    while (at(i + 1) === 0xff && i + 2 < input.length) i++;
    const marker = at(i + 1);
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x00) return null;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      parts.push(input.subarray(i, i + 2));
      i += 2;
      continue;
    }
    const len = (at(i + 2) << 8) | at(i + 3);
    const end = i + 2 + len;
    if (len < 2 || end > input.length) return null;
    if (marker === 0xda) {
      if (!sawFrame || at(input.length - 2) !== 0xff || at(input.length - 1) !== 0xd9) return null;
      parts.push(input.subarray(i));
      const total = parts.reduce((n, p) => n + p.length, 0);
      const bytes = new Uint8Array(total);
      let o = 0;
      for (const p of parts) {
        bytes.set(p, o);
        o += p.length;
      }
      return { bytes, width, height };
    }
    const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame) {
      if (marker > 0xc2 || sawFrame || len < 8) return null;
      height = (at(i + 5) << 8) | at(i + 6);
      width = (at(i + 7) << 8) | at(i + 8);
      sawFrame = true;
    }
    const metadata = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;
    if (!metadata) parts.push(input.subarray(i, end));
    i = end;
  }
  return null;
}

export function avatarSizeOk(width: number, height: number): boolean {
  return width >= AVATAR_MIN_SIDE && height >= AVATAR_MIN_SIDE && width <= AVATAR_MAX_SIDE && height <= AVATAR_MAX_SIDE;
}

// The AI must answer with strict JSON; only an explicit "allow" lets a photo through.
export function parseAvatarVerdict(text: string): boolean {
  const m = /\{[\s\S]*\}/.exec(text);
  if (!m) return false;
  try {
    const parsed = JSON.parse(m[0]) as { verdict?: unknown };
    return parsed.verdict === "allow";
  } catch {
    return false;
  }
}

// ---- cropping maths (browser) ----
export function coverScale(width: number, height: number, view: number): number {
  return view / Math.min(width, height);
}

// Keeps the picture covering the whole crop window: its edge can't be dragged inside it.
export function clampOffset(offset: number, shown: number, view: number): number {
  return Math.min(0, Math.max(view - shown, offset));
}

export function sourceRect(width: number, height: number, view: number, zoom: number, x: number, y: number) {
  const s = coverScale(width, height, view) * zoom;
  const size = view / s;
  return {
    sx: Math.max(0, Math.min(width - size, -x / s)),
    sy: Math.max(0, Math.min(height - size, -y / s)),
    size,
  };
}
