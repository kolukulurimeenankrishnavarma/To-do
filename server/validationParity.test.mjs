import { describe, expect, it } from "vitest";
import * as client from "../src/lib/auth.ts";
import * as clientConstants from "../src/lib/constants.ts";
import * as server from "./validation.mjs";

const SHARED_CONSTANTS = [
  "MAX_PROGRESS_LOG",
  "MAX_NOTE_LENGTH",
  "MAX_TITLE_LENGTH",
  "PROGRESS_STEP",
  "MAX_NAME_LENGTH",
  "MAX_EMAIL_LENGTH",
  "MIN_MOBILE_DIGITS",
  "MAX_MOBILE_DIGITS",
  "MIN_PASSWORD_LENGTH",
  "MAX_PASSWORD_LENGTH",
];

const NAMES = [
  "",
  "   ",
  "Ada Lovelace",
  "  Ada   Lovelace  ",
  "x".repeat(80),
  "x".repeat(81),
];

const EMAILS = [
  "",
  "not-an-email",
  "ada@example",
  " Ada@Example.COM ",
  `${"a".repeat(245)}@example.com`,
];

const MOBILES = [
  ["", undefined],
  ["98765 43210", "+91"],
  ["1 555 123 4567", "+1"],
  ["+1 (555) 123-4567", undefined],
  ["00 44 7700 900123", "+1"],
  ["+1 555", undefined],
  ["not-a-number", undefined],
  ["1".repeat(16), undefined],
];

const PASSWORDS = ["", "short", "12345678", "x".repeat(128), "x".repeat(129)];

describe("client/server validation parity", () => {
  it("uses the same limits and message inputs", () => {
    for (const name of SHARED_CONSTANTS) {
      expect(clientConstants[name], name).toBe(server[name]);
    }
  });

  it("normalizes and validates names identically", () => {
    for (const input of NAMES) {
      expect(client.normalizeName(input), `normalizeName: ${input}`).toBe(
        server.normalizeName(input),
      );
      expect(client.validateName(input), `validateName: ${input}`).toBe(
        server.validateName(input),
      );
    }
  });

  it("parses emails identically", () => {
    for (const input of EMAILS) {
      expect(client.parseEmail(input), `parseEmail: ${input}`).toEqual(
        server.parseEmail(input),
      );
    }
  });

  it("resolves and parses mobile numbers identically", () => {
    for (const [value, dial] of MOBILES) {
      expect(client.parseMobile(value, dial), `parseMobile: ${value}`).toEqual(
        server.parseMobile(value, dial),
      );
    }
  });

  it("validates passwords identically", () => {
    for (const input of PASSWORDS) {
      expect(client.validatePassword(input), `validatePassword: ${input}`).toBe(
        server.validatePassword(input),
      );
    }
  });
});
