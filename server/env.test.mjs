import { describe, expect, it } from "vitest";
import { parseEnvFile } from "./env.mjs";

describe("parseEnvFile", () => {
  it("reads plain, quoted, and exported values", () => {
    const values = parseEnvFile(
      [
        "# SMTP settings",
        "",
        "TASKLY_SMTP_HOST=smtp.example.com",
        "export TASKLY_SMTP_PORT=587",
        'TASKLY_SMTP_FROM="Taskly <hello@example.com>"',
        "TASKLY_SMTP_PASS='p@ss word'",
      ].join("\n"),
    );

    expect(values).toEqual({
      TASKLY_SMTP_HOST: "smtp.example.com",
      TASKLY_SMTP_PORT: "587",
      TASKLY_SMTP_FROM: "Taskly <hello@example.com>",
      TASKLY_SMTP_PASS: "p@ss word",
    });
  });

  it("ignores inline comments outside quotes and supports escaped newlines", () => {
    const values = parseEnvFile(
      [
        "TASKLY_PORT=8787 # local server",
        'PRIVATE_KEY="line one\\nline two"',
        "BROKEN LINE",
      ].join("\n"),
    );

    expect(values).toEqual({
      TASKLY_PORT: "8787",
      PRIVATE_KEY: "line one\nline two",
    });
  });
});
