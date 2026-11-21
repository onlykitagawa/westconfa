import { z } from "zod";
import { checkMessage } from "./moderation";

// Usernames and display names are public (profile, links, search), so the AI checks them before
// they are saved. There is no review queue for names: anything not clearly fine is refused and the
// student simply picks another one. Pure logic here; the AI call lives in ai-moderation.server.ts.

export const DISPLAY_NAME_MAX = 40;

export type NameField = "username" | "display_name";
export type NameDecision = { ok: true; source: "ai" | "filter" } | { ok: false; field: NameField };

const nameVerdictSchema = z.object({
  verdict: z.enum(["allow", "block"]),
  field: z.enum(["username", "display_name", "both", "none"]).optional(),
  reason: z.string().max(200).optional(),
});

// Underscores and digits often join or disguise words in usernames ("big_suka", "b1yat").
const asWords = (s: string) => s.replace(/_/g, " ");

function filterHit(username: string | null, displayName: string | null): NameField | null {
  if (username && checkMessage(asWords(username))) return "username";
  if (displayName && checkMessage(displayName)) return "display_name";
  return null;
}

export function nameInput(username: string | null, displayName: string | null): string {
  // JSON escaping keeps the name inside the data envelope (it can never add instructions).
  return JSON.stringify({ untrusted_name_data: { username, display_name: displayName } });
}

// Only the fields that changed are passed (null = not changed, not checked).
// If the AI can't be reached, the word filter alone decides, so nobody gets stuck in sign-up.
export async function screenName(
  username: string | null,
  displayName: string | null,
  callAI: (input: string) => Promise<string>,
): Promise<NameDecision> {
  if (!username && !displayName) return { ok: true, source: "filter" };
  const hit = filterHit(username, displayName);
  if (hit) return { ok: false, field: hit };
  let raw: string;
  try {
    raw = await callAI(nameInput(username, displayName));
  } catch {
    return { ok: true, source: "filter" };
  }
  let v: z.infer<typeof nameVerdictSchema>;
  try {
    v = nameVerdictSchema.parse(JSON.parse(raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, "")));
  } catch {
    // An unreadable answer is treated as a refusal: never let a name through unchecked by mistake.
    return { ok: false, field: username ? "username" : "display_name" };
  }
  if (v.verdict === "allow") return { ok: true, source: "ai" };
  const field: NameField = v.field === "display_name" && displayName ? "display_name" : username ? "username" : "display_name";
  return { ok: false, field };
}
