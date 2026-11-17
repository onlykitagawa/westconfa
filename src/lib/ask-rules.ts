import type { Screened, ScreenError } from "./text-screening";

// Small pure helpers for Ask, kept apart so they can be tested without a server.
export type AskError = ScreenError | "limit" | "notfound";

// What the AI thought on its own, kept next to the admin's decision so the AI can later be checked
// against (and taught from) what the admin actually approves. The "review everything" switch is
// applied by the database, so the AI is always asked for its real opinion.
export function aiOpinion(s: Extract<Screened, { ok: true }>): "allow" | "review" | "unavailable" {
  if (s.status === "approved") return "allow";
  return s.reason.startsWith("AI screening unavailable") ? "unavailable" : "review";
}

export function askErrorFromDb(message: string | undefined): AskError {
  const m = message ?? "";
  if (m.includes("rate_limited")) return "limit";
  if (m.includes("not_found") || m.includes("not_allowed")) return "notfound";
  return "generic";
}

// Which error text to show (errors without their own text get the generic one).
export function askErrorKey(code: AskError): "personal" | "blocked" | "empty" | "limit" | "notfound" | "generic" {
  return code === "personal" || code === "blocked" || code === "empty" || code === "limit" || code === "notfound" ? code : "generic";
}
