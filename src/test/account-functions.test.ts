import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ deleteUser: vi.fn(), remove: vi.fn(), avatar: vi.fn() }));
vi.mock("@tanstack/react-start", () => {
  const builder = { middleware: () => builder, inputValidator: () => builder, handler: (fn: unknown) => fn };
  return { createServerFn: () => builder };
});
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.avatar }) }) }),
    auth: { admin: { deleteUser: mocks.deleteUser } },
    storage: { from: () => ({ remove: mocks.remove }) },
  },
}));
import { deleteMyAccount } from "@/lib/account.functions";

const del = deleteMyAccount as unknown as (a: { context: { userId: string } }) => Promise<unknown>;
const ctx = { userId: "user-1" };
const URL = "https://x.supabase.co/storage/v1/object/public/avatars/user-1/a.jpg";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.avatar.mockResolvedValue({ data: { avatar_url: URL }, error: null });
  mocks.deleteUser.mockResolvedValue({ error: null });
  mocks.remove.mockResolvedValue({ data: [], error: null });
});

it("deleting an account also deletes the profile photo file", async () => {
  expect(await del({ context: ctx })).toEqual({ ok: true });
  expect(mocks.deleteUser).toHaveBeenCalledWith("user-1");
  expect(mocks.remove).toHaveBeenCalledWith(["user-1/a.jpg"]);
});

it("an account without a photo deletes normally", async () => {
  mocks.avatar.mockResolvedValue({ data: { avatar_url: null }, error: null });
  expect(await del({ context: ctx })).toEqual({ ok: true });
  expect(mocks.remove).not.toHaveBeenCalled();
});

it("the photo is kept if the account could not be deleted", async () => {
  mocks.deleteUser.mockResolvedValue({ error: { message: "boom" } });
  await expect(del({ context: ctx })).rejects.toThrow("Could not delete account");
  expect(mocks.remove).not.toHaveBeenCalled();
});
