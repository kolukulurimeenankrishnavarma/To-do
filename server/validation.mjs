import {
  createHash,
  pbkdf2 as pbkdf2Callback,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { fail } from "./http.mjs";

const pbkdf2 = promisify(pbkdf2Callback);

export const MAX_PROGRESS_LOG = 100;
export const MAX_NOTE_LENGTH = 280;
export const MAX_TITLE_LENGTH = 200;
export const PROGRESS_STEP = 5;

export const MAX_NAME_LENGTH = 80;
export const MAX_EMAIL_LENGTH = 254;
export const MIN_MOBILE_DIGITS = 7;
export const MAX_MOBILE_DIGITS = 15;
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;
export const PBKDF2_ITERATIONS = 150_000;
export const SALT_BYTES = 16;
export const HASH_BYTES = 32;
export const SESSION_MAX_AGE = 30 * 24 * 60 * 60 * 1000;
export const RESET_TOKEN_MAX_AGE = 60 * 60 * 1000;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MOBILE_PATTERN = new RegExp(
  `^\\+?\\d{${MIN_MOBILE_DIGITS},${MAX_MOBILE_DIGITS}}$`,
);

export function newId(prefix) {
  return `${prefix}_${randomUUID()}`;
}

export function normalizeName(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

export function validateName(value) {
  const name = normalizeName(value);
  if (name.length === 0) return "Enter your name.";
  if (name.length > MAX_NAME_LENGTH) {
    return `Names must be ${MAX_NAME_LENGTH} characters or fewer.`;
  }
  return null;
}

export function parseEmail(value) {
  const input = String(value ?? "").trim();
  if (input.length === 0) {
    return { ok: false, error: "Enter your email address." };
  }
  if (input.length > MAX_EMAIL_LENGTH) {
    return {
      ok: false,
      error: `Email addresses must be ${MAX_EMAIL_LENGTH} characters or fewer.`,
    };
  }

  const email = input.toLowerCase();
  if (!EMAIL_PATTERN.test(email)) {
    return {
      ok: false,
      error: "Enter a valid email address, like you@example.com.",
    };
  }

  return { ok: true, value: { email, key: email } };
}

function resolveMobile(value, countryDial) {
  const input = String(value ?? "").trim();
  if (input.length === 0) return "";
  if (/[a-zA-Z@]/.test(input)) return input;
  if (input.startsWith("+")) return input;
  if (input.startsWith("00")) {
    return `+${input.slice(2).replace(/\D/g, "")}`;
  }

  const digits = input.replace(/\D/g, "");
  const dialDigits = String(countryDial ?? "").replace(/\D/g, "");
  if (dialDigits.length === 0) return digits;

  if (
    digits.startsWith(dialDigits) &&
    digits.length >= dialDigits.length + MIN_MOBILE_DIGITS
  ) {
    return `+${digits}`;
  }

  return `+${dialDigits}${digits}`;
}

export function parseMobile(value, countryDial) {
  const resolved = countryDial
    ? resolveMobile(value, countryDial)
    : String(value ?? "").trim();
  if (resolved.length === 0) {
    return { ok: false, error: "Enter your mobile number." };
  }

  const compact = resolved.replace(/[\s().-]/g, "");
  if (!MOBILE_PATTERN.test(compact)) {
    return {
      ok: false,
      error: `Enter a valid mobile number with ${MIN_MOBILE_DIGITS}–${MAX_MOBILE_DIGITS} digits.`,
    };
  }

  const digits = compact.replace(/\D/g, "");
  const mobile = compact.startsWith("+") ? `+${digits}` : digits;

  return { ok: true, value: { mobile, key: digits } };
}

export function validatePassword(value) {
  const password = String(value ?? "");
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Passwords must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `Passwords must be ${MAX_PASSWORD_LENGTH} characters or fewer.`;
  }
  return null;
}

async function hashPassword(password, salt, iterations) {
  const bits = await pbkdf2(
    password,
    Buffer.from(salt, "base64"),
    iterations,
    HASH_BYTES,
    "sha256",
  );
  return bits.toString("base64");
}

export async function createPasswordRecord(password) {
  const salt = randomBytes(SALT_BYTES).toString("base64");
  const hash = await hashPassword(password, salt, PBKDF2_ITERATIONS);
  return { salt, hash, iterations: PBKDF2_ITERATIONS };
}

export async function verifyPassword(password, user) {
  const hash = await hashPassword(
    password,
    user.salt,
    user.iterations || PBKDF2_ITERATIONS,
  );
  const expected = Buffer.from(user.hash, "base64");
  const actual = Buffer.from(hash, "base64");
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

export function createSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function createResetToken() {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

/** Shared 400-error adapters for the validation functions above. */
export function parsedOrFail(result) {
  if (!result.ok) fail(400, result.error);
  return result.value;
}

export function validateOrFail(error) {
  if (error) fail(400, error);
}
