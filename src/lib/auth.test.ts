import { describe, expect, it } from "vitest";
import {
  normalizeName,
  parseEmail,
  parseMobile,
  resolveMobile,
  validateName,
  validatePassword,
} from "./auth";

describe("name validation", () => {
  it("normalizes whitespace and requires a name", () => {
    expect(normalizeName("  Ada   Lovelace  ")).toBe("Ada Lovelace");
    expect(validateName("  Ada   Lovelace  ")).toBeNull();
    expect(validateName("   ")).toContain("Enter your name");
    expect(validateName("x".repeat(81))).toContain("80");
  });
});

describe("email parsing", () => {
  it("accepts email addresses case-insensitively", () => {
    const result = parseEmail("  Ada@Example.COM  ");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      email: "ada@example.com",
      key: "ada@example.com",
    });
  });

  it("rejects empty, malformed, and oversized emails", () => {
    expect(parseEmail("")).toEqual({
      ok: false,
      error: "Enter your email address.",
    });

    const badEmail = parseEmail("ada@example");
    expect(badEmail.ok).toBe(false);
    if (badEmail.ok) return;
    expect(badEmail.error).toContain("valid email address");

    const longEmail = `${"a".repeat(245)}@example.com`;
    expect(parseEmail(longEmail).ok).toBe(false);
  });
});

describe("mobile parsing", () => {
  it("prepends the selected country code when the number needs one", () => {
    expect(resolveMobile("555 123 4567", "+1")).toBe("+15551234567");
    expect(resolveMobile("1 555 123 4567", "+1")).toBe("+15551234567");
    expect(resolveMobile("7700 900123", "+44")).toBe("+447700900123");
    expect(resolveMobile("98765 43210", "+91")).toBe("+919876543210");
    expect(resolveMobile("00 44 7700 900123", "+1")).toBe("+447700900123");
  });

  it("leaves fully international numbers untouched", () => {
    expect(resolveMobile("+44 7700 900123", "+1")).toBe("+44 7700 900123");
  });

  it("normalizes valid numbers and rejects invalid ones", () => {
    const international = parseMobile("+1 (555) 123-4567");
    expect(international.ok).toBe(true);
    if (!international.ok) return;
    expect(international.value).toEqual({
      mobile: "+15551234567",
      key: "15551234567",
    });

    const national = parseMobile("98765 43210", "+91");
    expect(national.ok).toBe(true);
    if (!national.ok) return;
    expect(national.value).toEqual({
      mobile: "+919876543210",
      key: "919876543210",
    });

    expect(parseMobile("")).toEqual({
      ok: false,
      error: "Enter your mobile number.",
    });

    const malformed = parseMobile("not-a-number");
    expect(malformed.ok).toBe(false);
    if (malformed.ok) return;
    expect(malformed.error).toContain("7–15 digits");

    expect(parseMobile("+1 555").ok).toBe(false);
    expect(parseMobile("1".repeat(16)).ok).toBe(false);
  });
});

describe("password validation", () => {
  it("enforces the password length limits", () => {
    expect(validatePassword("12345678")).toBeNull();
    expect(validatePassword("short")).toContain("at least 8");
    expect(validatePassword("x".repeat(129))).toContain("128");
  });
});
