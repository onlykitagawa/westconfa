import { beforeEach, expect, it, vi } from "vitest";

type Q = { select: () => Q; eq: () => Q; maybeSingle: () => Promise<{ data: unknown; error: null }> };
import { bytesToBase64 } from "@/lib/avatar-image";

const mocks = vi.hoisted(() => ({
  ai: vi.fn(),
  rpc: vi.fn(),
  adminRpc: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  publicUrl: vi.fn(),
  admin: false,
}));
vi.mock("@tanstack/react-start", () => {
  const builder = { middleware: () => builder, inputValidator: () => builder, handler: (fn: unknown) => fn };
  return { createServerFn: () => builder };
});
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/lib/avatar-screening.server", () => ({ callAvatarAI: mocks.ai }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    rpc: mocks.rpc,
    from: () => {
      const q: Q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: mocks.admin ? { role: "admin" } : null, error: null }) };
      return q;
    },
    storage: { from: () => ({ upload: mocks.upload, remove: mocks.remove, getPublicUrl: mocks.publicUrl }) },
  },
}));
import { adminRemoveAvatar, removeAvatar, reportAvatar, uploadAvatar } from "@/lib/avatar.functions";

type Ctx = { userId: string; supabase: { rpc: typeof mocks.adminRpc } };
const upload = uploadAvatar as unknown as (a: { data: { image: string }; context: Ctx }) => Promise<unknown>;
const remove = removeAvatar as unknown as (a: { context: Ctx }) => Promise<unknown>;
const report = reportAvatar as unknown as (a: { data: { username: string }; context: Ctx }) => Promise<unknown>;
const adminRemove = adminRemoveAvatar as unknown as (a: { data: { userId: string }; context: Ctx }) => Promise<unknown>;
const ctx: Ctx = { userId: "user-1", supabase: { rpc: mocks.adminRpc } };

const seg = (marker: number, payload: number[]) => [0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 0xff, ...payload];
const sof = (w: number, h: number) => seg(0xc0, [8, h >> 8, h & 0xff, w >> 8, w & 0xff, 1, 1, 0x11, 0]);
const sos = [0xff, 0xda, 0x00, 0x08, 1, 1, 0, 0, 63, 0];
const exif = Array.from("Exif\0\0GPSLatitude").map((c) => c.charCodeAt(0));
const makeJpeg = (w = 512, h = 512) => new Uint8Array([0xff, 0xd8, ...seg(0xe1, exif), ...sof(w, h), ...sos, 0x12, 0x34, 0xff, 0xd9]);
const image = (w?: number, h?: number) => bytesToBase64(makeJpeg(w, h));
const verdict = (v: string) => JSON.stringify({ verdict: v, reason: "" });
const NEW_URL = "https://x.supabase.co/storage/v1/object/public/avatars/user-1/new.jpg";
const OLD_URL = "https://x.supabase.co/storage/v1/object/public/avatars/user-1/old.jpg";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.admin = false;
  mocks.ai.mockResolvedValue(verdict("allow"));
  mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "set_profile_avatar" ? OLD_URL : null, error: null }));
  mocks.adminRpc.mockResolvedValue({ data: OLD_URL, error: null });
  mocks.upload.mockResolvedValue({ data: {}, error: null });
  mocks.remove.mockResolvedValue({ data: [], error: null });
  mocks.publicUrl.mockReturnValue({ data: { publicUrl: NEW_URL } });
});

it("a clean photo is checked, stored under a random name and linked, and the old file is deleted", async () => {
  expect(await upload({ data: { image: image() }, context: ctx })).toEqual({ ok: true, url: NEW_URL });
  expect(mocks.rpc).toHaveBeenCalledWith("start_avatar_upload", { _user: "user-1" });
  const [path, , options] = mocks.upload.mock.calls[0]!;
  expect(path).toMatch(/^user-1\/[0-9a-f-]{36}\.jpg$/);
  expect(options).toMatchObject({ contentType: "image/jpeg", upsert: false });
  expect(mocks.rpc).toHaveBeenCalledWith("set_profile_avatar", { _user: "user-1", _url: NEW_URL });
  expect(mocks.remove).toHaveBeenCalledWith(["user-1/old.jpg"]);
});

it("hidden camera details never reach the AI or storage", async () => {
  await upload({ data: { image: image() }, context: ctx });
  const sentToAi = Buffer.from(mocks.ai.mock.calls[0]![0] as string, "base64");
  expect(sentToAi.includes(Buffer.from("GPSLatitude"))).toBe(false);
  const stored = Buffer.from(mocks.upload.mock.calls[0]![1] as Uint8Array);
  expect(stored.includes(Buffer.from("GPSLatitude"))).toBe(false);
});

it("bad files are refused before any database or AI work", async () => {
  expect(await upload({ data: { image: "not base64!!" }, context: ctx })).toEqual({ ok: false, code: "invalid" });
  expect(await upload({ data: { image: bytesToBase64(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4])) }, context: ctx })).toEqual({ ok: false, code: "invalid" });
  expect(await upload({ data: { image: image(32, 32) }, context: ctx })).toEqual({ ok: false, code: "invalid" });
  expect(await upload({ data: { image: image(4000, 4000) }, context: ctx })).toEqual({ ok: false, code: "invalid" });
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.ai).not.toHaveBeenCalled();
});

it("the hourly limit stops an upload before the AI is called", async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: { message: "avatar_limit" } });
  expect(await upload({ data: { image: image() }, context: ctx })).toEqual({ ok: false, code: "limit" });
  expect(mocks.ai).not.toHaveBeenCalled();
});

it("anything but an explicit allow is refused and nothing is stored", async () => {
  for (const reply of [verdict("refuse"), verdict("review"), "I think it is fine", ""]) {
    mocks.ai.mockResolvedValue(reply);
    expect(await upload({ data: { image: image() }, context: ctx })).toEqual({ ok: false, code: "refused" });
  }
  expect(mocks.upload).not.toHaveBeenCalled();
});

it("if the AI check can't run, the photo is not accepted", async () => {
  mocks.ai.mockRejectedValue(new Error("AI screening paused"));
  expect(await upload({ data: { image: image() }, context: ctx })).toEqual({ ok: false, code: "unavailable" });
  expect(mocks.upload).not.toHaveBeenCalled();
});

it("a failed save does not leave the new file behind", async () => {
  mocks.upload.mockResolvedValue({ data: null, error: { message: "boom" } });
  expect(await upload({ data: { image: image() }, context: ctx })).toEqual({ ok: false, code: "generic" });
  mocks.upload.mockResolvedValue({ data: {}, error: null });
  mocks.rpc.mockImplementation(async (name: string) => (name === "set_profile_avatar" ? { data: null, error: { message: "not_allowed" } } : { data: null, error: null }));
  expect(await upload({ data: { image: image() }, context: ctx })).toEqual({ ok: false, code: "notfound" });
  expect(mocks.remove).toHaveBeenCalledWith(["user-1/new.jpg"]);
});

it("removing a photo clears the profile and deletes the file", async () => {
  expect(await remove({ context: ctx })).toEqual({ ok: true, url: null });
  expect(mocks.rpc).toHaveBeenCalledWith("set_profile_avatar", { _user: "user-1", _url: null });
  expect(mocks.remove).toHaveBeenCalledWith(["user-1/old.jpg"]);
});

it("a report deletes the file only when it takes the photo down", async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: null });
  expect(await report({ data: { username: "zeo" }, context: ctx })).toEqual({ ok: true, url: null });
  expect(mocks.rpc).toHaveBeenCalledWith("report_avatar", { _reporter: "user-1", _username: "zeo" });
  expect(mocks.remove).not.toHaveBeenCalled();
  mocks.rpc.mockResolvedValue({ data: OLD_URL, error: null });
  await report({ data: { username: "zeo" }, context: ctx });
  expect(mocks.remove).toHaveBeenCalledWith(["user-1/old.jpg"]);
  mocks.rpc.mockResolvedValue({ data: null, error: { message: "not_allowed" } });
  expect(await report({ data: { username: "zeo" }, context: ctx })).toEqual({ ok: false, code: "notfound" });
});

it("only admins can remove someone else's photo", async () => {
  expect(await adminRemove({ data: { userId: "user-2" }, context: ctx })).toEqual({ ok: true, url: null });
  expect(mocks.adminRpc).toHaveBeenCalledWith("admin_clear_avatar", { _user_id: "user-2" });
  expect(mocks.remove).toHaveBeenCalledWith(["user-1/old.jpg"]);
  mocks.remove.mockClear();
  mocks.adminRpc.mockResolvedValue({ data: null, error: { message: "Forbidden" } });
  expect(await adminRemove({ data: { userId: "user-2" }, context: ctx })).toEqual({ ok: false, code: "notfound" });
  expect(mocks.remove).not.toHaveBeenCalled();
});

it("an admin's photo skips the hourly limit and the AI check but must still be a valid JPEG", async () => {
  mocks.admin = true;
  expect(await upload({ data: { image: image() }, context: ctx })).toEqual({ ok: true, url: NEW_URL });
  expect(mocks.ai).not.toHaveBeenCalled();
  expect(mocks.rpc).not.toHaveBeenCalledWith("start_avatar_upload", expect.anything());
  expect(await upload({ data: { image: "not base64!!" }, context: ctx })).toEqual({ ok: false, code: "invalid" });
});
