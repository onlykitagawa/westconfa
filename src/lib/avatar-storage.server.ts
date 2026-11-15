export const AVATAR_BUCKET = "avatars";
const PUBLIC_PREFIX = `/storage/v1/object/public/${AVATAR_BUCKET}/`;

type Storage = { storage: { from: (bucket: string) => { remove: (paths: string[]) => PromiseLike<unknown> } } };

// Best effort: a leftover file is harmless (its name can't be guessed), and a failed delete must
// never break the request that triggered it.
export async function removeAvatarObject(admin: Storage, url: string | null | undefined): Promise<void> {
  if (!url) return;
  const at = url.indexOf(PUBLIC_PREFIX);
  if (at < 0) return;
  let path = "";
  try {
    path = decodeURIComponent(url.slice(at + PUBLIC_PREFIX.length).split("?")[0] ?? "");
  } catch {
    return;
  }
  if (!path) return;
  try {
    await admin.storage.from(AVATAR_BUCKET).remove([path]);
  } catch {
    // ignore
  }
}
