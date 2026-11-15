import { screenMessage } from "./message-screening";
import { checkMessage, MAX_MESSAGE_LENGTH } from "./moderation";

export type ScreenError = "empty" | "personal" | "blocked" | "generic";
export type Screened = { ok: true; body: string; status: "approved" | "pending"; reason: string } | { ok: false; code: ScreenError };

// Same rules as a first message: contact details are refused, the AI blocks only the worst,
// swearing/threat words and anything the AI is unsure about are held ("pending") for a human.
export async function screenText(raw: string, reviewAll: boolean): Promise<Screened> {
  const body = raw.trim();
  if (!body) return { ok: false, code: "empty" };
  if (body.length > MAX_MESSAGE_LENGTH) return { ok: false, code: "generic" };
  const filterHit = checkMessage(body);
  if (filterHit === "personal") return { ok: false, code: "personal" };
  const { callModerationAI } = await import("./ai-moderation.server");
  const screened = await screenMessage(body, reviewAll, callModerationAI);
  if (screened.blocked) return { ok: false, code: "blocked" };
  if (filterHit && screened.status === "approved") {
    return { ok: true, body, status: "pending", reason: filterHit === "threat" ? "Word filter: possible threat." : "Word filter: swearing or offensive word." };
  }
  return { ok: true, body, status: screened.status, reason: screened.reason };
}
