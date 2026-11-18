import {
  MAX_EMAIL_LENGTH,
  MAX_MOBILE_DIGITS,
  MAX_NAME_LENGTH,
  MAX_PASSWORD_LENGTH,
  MIN_MOBILE_DIGITS,
  MIN_PASSWORD_LENGTH,
} from "./constants";
import type { Result } from "../types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MOBILE_PATTERN = new RegExp(
  `^\\+?\\d{${MIN_MOBILE_DIGITS},${MAX_MOBILE_DIGITS}}$`,
);

export type ParsedEmail = {
  email: string;
  key: string;
};

export type ParsedMobile = {
  mobile: string;
  key: string;
};

export type FieldResult<T> = Result<{ value: T }>;

export function normalizeName(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function validateName(value: string): string | null {
  const name = normalizeName(value);
  if (name.length === 0) return "Enter your name.";
  if (name.length > MAX_NAME_LENGTH) {
    return `Names must be ${MAX_NAME_LENGTH} characters or fewer.`;
  }
  return null;
}

export function parseEmail(value: string): FieldResult<ParsedEmail> {
  const input = value.trim();
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

export function resolveMobile(value: string, countryDial: string): string {
  const input = value.trim();
  if (input.length === 0) return "";
  if (/[a-zA-Z@]/.test(input)) return input;
  if (input.startsWith("+")) return input;
  if (input.startsWith("00")) {
    return `+${input.slice(2).replace(/\D/g, "")}`;
  }

  const digits = input.replace(/\D/g, "");
  const dialDigits = countryDial.replace(/\D/g, "");
  if (dialDigits.length === 0) return digits;

  if (
    digits.startsWith(dialDigits) &&
    digits.length >= dialDigits.length + MIN_MOBILE_DIGITS
  ) {
    return `+${digits}`;
  }

  return `+${dialDigits}${digits}`;
}

export function parseMobile(
  value: string,
  countryDial?: string,
): FieldResult<ParsedMobile> {
  const resolved = countryDial ? resolveMobile(value, countryDial) : value.trim();
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

export function validatePassword(value: string): string | null {
  if (value.length < MIN_PASSWORD_LENGTH) {
    return `Passwords must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (value.length > MAX_PASSWORD_LENGTH) {
    return `Passwords must be ${MAX_PASSWORD_LENGTH} characters or fewer.`;
  }
  return null;
}
