import net from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  readSmtpConfig,
  sendInviteEmail,
  sendPasswordResetEmail,
  sendTestEmail,
  smtpConfigured,
} from "./smtp.mjs";

const SMTP_KEYS = [
  "TASKLY_SMTP_URL",
  "TASKLY_SMTP_HOST",
  "TASKLY_SMTP_PORT",
  "TASKLY_SMTP_USER",
  "TASKLY_SMTP_PASS",
  "TASKLY_SMTP_SECURE",
  "TASKLY_SMTP_STARTTLS",
  "TASKLY_SMTP_FROM",
];

const savedEnv = new Map(SMTP_KEYS.map((key) => [key, process.env[key]]));

function clearSmtpEnv() {
  for (const key of SMTP_KEYS) delete process.env[key];
}

function configureLocalServer(port) {
  process.env.TASKLY_SMTP_HOST = "127.0.0.1";
  process.env.TASKLY_SMTP_PORT = String(port);
  process.env.TASKLY_SMTP_FROM = "Taskly <no-reply@example.com>";
}

async function startFakeSmtp() {
  const commands = [];
  const messages = [];

  const server = net.createServer((socket) => {
    socket.write("220 localhost ESMTP Taskly test\r\n");
    let inData = false;
    let message = "";

    socket.on("data", (chunk) => {
      const text = chunk.toString("utf8");

      if (inData) {
        message += text;
        if (message.includes("\r\n.\r\n")) {
          inData = false;
          messages.push(message);
          socket.write("250 2.0.0 Message queued\r\n");
        }
        return;
      }

      for (const line of text.split(/\r?\n/).filter(Boolean)) {
        commands.push(line);
        if (/^EHLO/i.test(line)) {
          socket.write("250-localhost\r\n250 AUTH PLAIN LOGIN\r\n");
        } else if (/^AUTH PLAIN/i.test(line)) {
          socket.write("235 2.7.0 Authentication successful\r\n");
        } else if (/^DATA/i.test(line)) {
          inData = true;
          socket.write("354 End data with <CR><LF>.<CR><LF>\r\n");
        } else if (/^QUIT/i.test(line)) {
          socket.write("221 Bye\r\n");
          socket.end();
        } else {
          socket.write("250 OK\r\n");
        }
      }
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, commands, messages };
}

async function stopFakeSmtp(server) {
  await new Promise((resolve) => server.close(resolve));
}

afterEach(() => {
  clearSmtpEnv();
  for (const [key, value] of savedEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("SMTP configuration", () => {
  beforeEach(clearSmtpEnv);

  it("is disabled until a host or URL is provided", () => {
    expect(smtpConfigured()).toBe(false);
    expect(readSmtpConfig()).toBeNull();
  });

  it("parses smtp and smtps URLs with secure defaults", () => {
    process.env.TASKLY_SMTP_URL =
      "smtp://user:pa%40ss@smtp.example.com:2525";
    expect(readSmtpConfig()).toMatchObject({
      host: "smtp.example.com",
      port: 2525,
      secure: false,
      starttls: true,
      user: "user",
      pass: "pa@ss",
      from: "user",
    });

    process.env.TASKLY_SMTP_URL = "smtps://alerts%40example.com@mail.example.com";
    expect(readSmtpConfig()).toMatchObject({
      host: "mail.example.com",
      port: 465,
      secure: true,
      from: "alerts@example.com",
    });
  });

  it("parses individual variables and honors the STARTTLS opt-out", () => {
    process.env.TASKLY_SMTP_HOST = "smtp.example.com";
    process.env.TASKLY_SMTP_PORT = "1025";
    process.env.TASKLY_SMTP_USER = "apikey";
    process.env.TASKLY_SMTP_PASS = "secret";
    process.env.TASKLY_SMTP_SECURE = "1";
    process.env.TASKLY_SMTP_STARTTLS = "0";
    process.env.TASKLY_SMTP_FROM = "Taskly <taskly@example.com>";

    expect(readSmtpConfig()).toEqual({
      host: "smtp.example.com",
      port: 1025,
      secure: true,
      starttls: false,
      user: "apikey",
      pass: "secret",
      from: "Taskly <taskly@example.com>",
    });
  });
});

describe("SMTP delivery", () => {
  let fake;

  beforeEach(async () => {
    clearSmtpEnv();
    fake = await startFakeSmtp();
    configureLocalServer(fake.server.address().port);
  });

  afterEach(async () => {
    if (fake) await stopFakeSmtp(fake.server);
  });

  it("sends an invitation with the shareable link", async () => {
    const result = await sendInviteEmail({
      to: "teammate@example.com",
      teamName: "Launch Crew",
      inviterName: "Asha",
      link: "http://localhost:8787/?invite=invite_1",
    });

    expect(result).toEqual({ sent: true, error: null });
    expect(fake.commands).toContain("MAIL FROM:<no-reply@example.com>");
    expect(fake.commands).toContain("RCPT TO:<teammate@example.com>");
    expect(fake.messages[0]).toContain("To: teammate@example.com");
    expect(fake.messages[0]).toContain("Launch Crew");
    expect(fake.messages[0]).toContain("http://localhost:8787/?invite=invite_1");
  });

  it("sends a password-reset link with its expiry notice", async () => {
    const result = await sendPasswordResetEmail({
      to: "member@example.com",
      name: "Asha",
      link: "http://localhost:8787/?reset=token_1",
    });

    expect(result.sent).toBe(true);
    expect(fake.messages[0]).toContain("Hi Asha");
    expect(fake.messages[0]).toContain("http://localhost:8787/?reset=token_1");
    expect(fake.messages[0]).toContain("expires in one hour");
  });

  it("sends a test message used by the mail:test command", async () => {
    const result = await sendTestEmail({ to: "me@example.com" });

    expect(result.sent).toBe(true);
    expect(fake.messages[0]).toContain(
      "This is a test message from your Taskly server.",
    );
  });

  it("reports a clear error when delivery fails", async () => {
    const port = fake.server.address().port;
    await stopFakeSmtp(fake.server);
    fake = null;

    const result = await sendTestEmail({ to: "me@example.com" });
    expect(result.sent).toBe(false);
    expect(result.error).toBeTruthy();
    expect(port).toBeGreaterThan(0);
  });
});
