import { describe, expect, it } from "vitest";
import { checkMessage, isAllowedEmail, isValidUsername, MAX_MESSAGE_LENGTH, LIMIT_PER_SENDER_PER_HOUR, LIMIT_PER_SENDER_TO_RECIPIENT_PER_HOUR } from "@/lib/moderation";

describe("email allowlist", () => {
  it("accepts @wiut.uz emails", () => expect(isAllowedEmail("00012345@wiut.uz")).toBe(true));
  it("always accepts the owner gmail", () => expect(isAllowedEmail("ZukhrdnvoyBek@gmail.com")).toBe(true));
  it("rejects other domains", () => expect(isAllowedEmail("someone@gmail.com")).toBe(false));
  it("rejects lookalike domains", () => expect(isAllowedEmail("a@fakewiut.uz.com")).toBe(false));
});

describe("limits", () => {
  it("messages are capped at 500 characters", () => expect(MAX_MESSAGE_LENGTH).toBe(500));
  it("5 per hour per sender, 3 per hour to the same recipient", () => {
    expect(LIMIT_PER_SENDER_PER_HOUR).toBe(5);
    expect(LIMIT_PER_SENDER_TO_RECIPIENT_PER_HOUR).toBe(3);
  });
});

describe("usernames", () => {
  it("allows a-z, 0-9 and underscore", () => expect(isValidUsername("ali_2026")).toBe(true));
  it("rejects capitals and symbols", () => expect(isValidUsername("Ali-2")).toBe(false));
});

describe("blocklist", () => {
  it("passes a kind message", () => expect(checkMessage("You were great in the presentation today!")).toBeNull());
  it("blocks phone numbers", () => expect(checkMessage("call me +998 90 123 45 67")).toBe("personal"));
  it("blocks Russian threats", () => expect(checkMessage("я тебя убью")).toBe("threat"));
  it("blocks Uzbek threats", () => expect(checkMessage("seni o'ldiraman")).toBe("threat"));
  it("blocks English slurs", () => expect(checkMessage("you are a retard")).toBe("slur"));
});
