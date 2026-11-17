import { loadEnvFile } from "./env.mjs";
import { readSmtpConfig, sendTestEmail, smtpConfigured } from "./smtp.mjs";

loadEnvFile();

const toArgIndex = process.argv.indexOf("--to");
const to =
  (toArgIndex >= 0 ? process.argv[toArgIndex + 1] : "") ||
  process.env.TASKLY_TEST_EMAIL ||
  "";

if (!to) {
  console.error(
    [
      "Usage: npm run mail:test -- --to you@example.com",
      "",
      "Configure SMTP in .env first (copy .env.example and fill it in).",
    ].join("\n"),
  );
  process.exit(1);
}

if (!smtpConfigured()) {
  console.error(
    [
      "SMTP is not configured.",
      "Copy .env.example to .env and set TASKLY_SMTP_HOST (or TASKLY_SMTP_URL).",
    ].join("\n"),
  );
  process.exit(1);
}

const config = readSmtpConfig();
console.log(
  `Sending test mail via ${config.host}:${config.port} ` +
    `(${config.secure ? "implicit TLS" : config.starttls ? "STARTTLS" : "plain"}) ` +
    `from ${config.from} to ${to}...`,
);

const result = await sendTestEmail({ to });
if (result.sent) {
  console.log("SMTP delivery succeeded. Check the recipient inbox and spam folder.");
} else {
  console.error(`SMTP delivery failed: ${result.error}`);
  process.exit(1);
}
