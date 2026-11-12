import { z } from "zod";

export const verdictSchema = z.object({
  verdict: z.enum(["allow", "review", "block"]),
  category: z.enum(["threat", "hate", "sexual", "personal_info", "self_harm", "harassment", "spam", "other", "none"]),
  reason: z.string().max(140),
}).strict();
export type ModerationVerdict = z.infer<typeof verdictSchema>;
export type ScreeningDecision =
  | { blocked: true }
  | { blocked: false; status: "approved" | "pending"; source: "ai" | "review_all" | "ai_error"; category: string; reason: string };

export function parseVerdict(text: string): ModerationVerdict {
  return verdictSchema.parse(JSON.parse(text));
}

// JSON escaping means message text can never close the data envelope or add a role.
export function moderationInput(body: string): string {
  return JSON.stringify({ untrusted_message_data: body });
}

export function attemptsModeratorInstruction(body: string): boolean {
  return /ignore.{0,40}(rules|instructions|prompt)|(?:say|return|output|verdict).{0,20}["']?allow|system\s*prompt|игнорируй.{0,40}(правил|инструкц)|qoidalarni.{0,20}(unut|e'tiborsiz)/iu.test(body);
}

export async function screenMessage(body: string, reviewAll: boolean, callAI: (body: string) => Promise<string>): Promise<ScreeningDecision> {
  try {
    const result = parseVerdict(await callAI(body));
    if (attemptsModeratorInstruction(body)) {
      return { blocked: false, status: "pending", source: "ai", category: "other", reason: "Message attempts to instruct the moderator." };
    }
    if (result.verdict === "block") return { blocked: true };
    return {
      blocked: false,
      status: result.verdict === "review" || reviewAll ? "pending" : "approved",
      source: result.verdict === "review" ? "ai" : reviewAll ? "review_all" : "ai",
      category: result.category,
      reason: result.reason,
    };
  } catch {
    return { blocked: false, status: "pending", source: "ai_error", category: "other", reason: "AI screening unavailable or invalid output; manual review required." };
  }
}