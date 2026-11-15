import { expect, it } from "vitest";
import { avatarSizeOk, base64ToBytes, bytesToBase64, clampOffset, cleanJpeg, coverScale, parseAvatarVerdict, sourceRect } from "@/lib/avatar-image";

const seg = (marker: number, payload: number[]) => [0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 0xff, ...payload];
const sof = (w: number, h: number, marker = 0xc0) => seg(marker, [8, h >> 8, h & 0xff, w >> 8, w & 0xff, 1, 1, 0x11, 0]);
const sos = [0xff, 0xda, 0x00, 0x08, 1, 1, 0, 0, 63, 0];
const jpeg = (...segments: number[][]) => new Uint8Array([0xff, 0xd8, ...segments.flat(), ...sos, 0x12, 0x34, 0xff, 0xd9]);
const text = (s: string) => Array.from(s).map((c) => c.charCodeAt(0));
const contains = (bytes: Uint8Array, s: string) => Buffer.from(bytes).includes(Buffer.from(s));

it("removes EXIF, XMP and comments but keeps the picture data", () => {
  const input = jpeg(seg(0xe0, text("JFIF\0")), seg(0xe1, text("Exif\0\0GPSLatitude")), seg(0xe1, text("http://ns.adobe.com/xap")), seg(0xfe, text("shot at home")), seg(0xdb, [0, 1, 2, 3]), sof(300, 200));
  const out = cleanJpeg(input);
  expect(out).not.toBeNull();
  expect(out).toMatchObject({ width: 300, height: 200 });
  expect(contains(out!.bytes, "GPSLatitude")).toBe(false);
  expect(contains(out!.bytes, "shot at home")).toBe(false);
  expect(contains(out!.bytes, "JFIF")).toBe(true);
  expect(out!.bytes.length).toBeLessThan(input.length);
  expect(Array.from(out!.bytes.slice(0, 2))).toEqual([0xff, 0xd8]);
  expect(Array.from(out!.bytes.slice(-2))).toEqual([0xff, 0xd9]);
});

it("accepts baseline and progressive JPEGs only", () => {
  expect(cleanJpeg(jpeg(sof(100, 100, 0xc2)))).toMatchObject({ width: 100, height: 100 });
  expect(cleanJpeg(jpeg(sof(100, 100, 0xc9)))).toBeNull();
  expect(cleanJpeg(jpeg(sof(100, 100), sof(100, 100)))).toBeNull();
  expect(cleanJpeg(jpeg(seg(0xdb, [1, 2])))).toBeNull();
});

it("rejects files that are not complete JPEGs", () => {
  expect(cleanJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBeNull();
  expect(cleanJpeg(new Uint8Array([]))).toBeNull();
  expect(cleanJpeg(jpeg(sof(100, 100)).slice(0, -2))).toBeNull();
  expect(cleanJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x7f, 0xff, 1, 2, 3]))).toBeNull();
});

it("checks the picture size", () => {
  expect(avatarSizeOk(512, 512)).toBe(true);
  expect(avatarSizeOk(63, 512)).toBe(false);
  expect(avatarSizeOk(512, 1025)).toBe(false);
});

it("converts base64 both ways and rejects junk", () => {
  const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
  expect(Array.from(base64ToBytes(bytesToBase64(bytes))!)).toEqual(Array.from(bytes));
  expect(base64ToBytes("not base64!!")).toBeNull();
  expect(base64ToBytes("")).toBeNull();
  expect(base64ToBytes("data:image/jpeg;base64,AAAA")).toBeNull();
});

it("only an explicit allow lets a photo through", () => {
  expect(parseAvatarVerdict('{"verdict":"allow","reason":"portrait"}')).toBe(true);
  expect(parseAvatarVerdict('Sure!\n{"verdict":"allow","reason":"ok"}')).toBe(true);
  expect(parseAvatarVerdict('{"verdict":"refuse","reason":"nudity"}')).toBe(false);
  expect(parseAvatarVerdict('{"verdict":"review"}')).toBe(false);
  expect(parseAvatarVerdict("allow")).toBe(false);
  expect(parseAvatarVerdict("{not json}")).toBe(false);
  expect(parseAvatarVerdict("")).toBe(false);
});

it("crop maths keeps the picture covering the circle", () => {
  expect(coverScale(400, 200, 256)).toBeCloseTo(1.28);
  expect(clampOffset(50, 512, 256)).toBe(0);
  expect(clampOffset(-400, 512, 256)).toBe(-256);
  expect(clampOffset(-100, 512, 256)).toBe(-100);
  const r = sourceRect(400, 200, 256, 1, -128, 0);
  expect(r.size).toBeCloseTo(200);
  expect(r.sx).toBeCloseTo(100);
  expect(r.sy).toBeCloseTo(0);
  const zoomed = sourceRect(400, 200, 256, 2, -128, -128);
  expect(zoomed.size).toBeCloseTo(100);
  expect(zoomed.sx + zoomed.size).toBeLessThanOrEqual(400);
  expect(zoomed.sy + zoomed.size).toBeLessThanOrEqual(200);
});
