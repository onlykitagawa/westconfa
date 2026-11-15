import { describe, expect, it } from "vitest";
import { en } from "@/i18n/en";
import { ru } from "@/i18n/ru";
import { uz } from "@/i18n/uz";

// Every language must have exactly the same keys, arrays of the same length and functions in the
// same places, so a missing translation can never crash a page or show "undefined".
type Shape = string | { [k: string]: Shape } | Shape[];
function shape(v: unknown): Shape {
  if (typeof v === "function") return `fn${v.length}`;
  if (Array.isArray(v)) return v.map(shape);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, shape(x)]));
  return typeof v;
}
function strings(v: unknown, path = ""): [string, string][] {
  if (typeof v === "string") return [[path, v]];
  if (Array.isArray(v)) return v.flatMap((x, i) => strings(x, `${path}[${i}]`));
  if (v && typeof v === "object") return Object.entries(v).flatMap(([k, x]) => strings(x, path ? `${path}.${k}` : k));
  return [];
}

describe("translations", () => {
  for (const [name, dict] of [["ru", ru], ["uz", uz]] as const) {
    it(`${name} has the same shape as en`, () => expect(shape(dict)).toEqual(shape(en)));
    it(`${name} has no empty text`, () => {
      const empty = strings(dict).filter(([, s]) => s.trim() === "").map(([p]) => p);
      expect(empty).toEqual([]);
    });
    it(`${name} functions return text`, () => {
      expect(dict.inbox.unread(3)).toMatch(/3/);
      expect(dict.sent.replies(21)).toMatch(/21/);
      expect(dict.auth.resendIn(9)).toMatch(/9/);
      expect(dict.send.metaTitle("Ali")).toMatch(/Ali/);
    });
  }
  it("Russian plurals", () => {
    expect(ru.sent.replies(1)).toBe("1 ответ");
    expect(ru.sent.replies(3)).toBe("3 ответа");
    expect(ru.sent.replies(11)).toBe("11 ответов");
    expect(ru.sent.replies(22)).toBe("22 ответа");
  });
});
