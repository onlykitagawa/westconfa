import { describe, expect, it } from "vitest";
import { checkMessage, isAllowedEmail, isValidUsername, MAX_MESSAGE_LENGTH, LIMIT_PER_SENDER_PER_HOUR, LIMIT_PER_SENDER_TO_RECIPIENT_PER_HOUR } from "@/lib/moderation";

describe("email allowlist", () => {
  it("accepts @students.wiut.uz emails", () => expect(isAllowedEmail("00012345@students.wiut.uz")).toBe(true));
  it("rejects plain @wiut.uz emails", () => expect(isAllowedEmail("00012345@wiut.uz")).toBe(false));
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

import { isValidPassword, LOGIN_MAX_FAILED_ATTEMPTS, LOGIN_WINDOW_MINUTES, SESSION_MAX_DAYS, RESEND_COOLDOWN_SECONDS } from "@/lib/moderation";
describe("accounts", () => {
  it("passwords need at least 8 characters", () => {
    expect(isValidPassword("1234567")).toBe(false);
    expect(isValidPassword("12345678")).toBe(true);
  });
  it("5 failed sign-ins per 15 minutes", () => {
    expect(LOGIN_MAX_FAILED_ATTEMPTS).toBe(5);
    expect(LOGIN_WINDOW_MINUTES).toBe(15);
  });
  it("sessions last 30 days, resend waits 60s", () => {
    expect(SESSION_MAX_DAYS).toBe(30);
    expect(RESEND_COOLDOWN_SECONDS).toBe(60);
  });
});

import { isRateLimited } from "@/lib/moderation";
describe("rate limits", () => {
  const anon = (total: number, toRecipient: number, anonToRecipient = 0) => isRateLimited({ signedIn: false, total, toRecipient, anonToRecipient });
  it("anonymous network: 10/hour to same person", () => { expect(anon(9, 9)).toBe(false); expect(anon(10, 10)).toBe(true); });
  it("anonymous network: 30/hour total", () => { expect(anon(29, 0)).toBe(false); expect(anon(30, 0)).toBe(true); });
  it("anonymous visitors to one recipient: 20/hour across networks", () => { expect(anon(0, 0, 19)).toBe(false); expect(anon(0, 0, 20)).toBe(true); });
  it("signed-in keeps 5 total and 3 per recipient, ignores anon cap", () => {
    expect(isRateLimited({ signedIn: true, total: 4, toRecipient: 2, anonToRecipient: 50 })).toBe(false);
    expect(isRateLimited({ signedIn: true, total: 5, toRecipient: 0, anonToRecipient: 0 })).toBe(true);
    expect(isRateLimited({ signedIn: true, total: 3, toRecipient: 3, anonToRecipient: 0 })).toBe(true);
  });
});
