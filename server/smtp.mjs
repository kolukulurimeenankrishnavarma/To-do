import { hostname } from "node:os";
import { connect as netConnect } from "node:net";
import { connect as tlsConnect } from "node:tls";

const SMTP_TIMEOUT = 12_000;

export function readSmtpConfig() {
  const url = process.env.TASKLY_SMTP_URL;
  if (url) {
    try {
      const parsed = new URL(url);
      if (
        (parsed.protocol !== "smtp:" && parsed.protocol !== "smtps:") ||
        !parsed.hostname
      ) {
        return null;
      }
      const secure = parsed.protocol === "smtps:";
      const user = decodeURIComponent(parsed.username);
      const pass = decodeURIComponent(parsed.password);
      return {
        host: parsed.hostname,
        port: Number(parsed.port) || (secure ? 465 : 587),
        secure,
        starttls: process.env.TASKLY_SMTP_STARTTLS !== "0",
        user,
        pass,
        from:
          process.env.TASKLY_SMTP_FROM ||
          user ||
          `taskly@${parsed.hostname}`,
      };
    } catch {
      return null;
    }
  }

  const host = process.env.TASKLY_SMTP_HOST;
  if (!host) return null;

  const secure = process.env.TASKLY_SMTP_SECURE === "1";
  const user = process.env.TASKLY_SMTP_USER ?? "";
  const pass = process.env.TASKLY_SMTP_PASS ?? "";

  return {
    host,
    port: Number(process.env.TASKLY_SMTP_PORT) || (secure ? 465 : 587),
    secure,
    starttls: process.env.TASKLY_SMTP_STARTTLS !== "0",
    user,
    pass,
    from: process.env.TASKLY_SMTP_FROM || user || `taskly@${host}`,
  };
}

// Envelope addresses must be bare email addresses even when the From header
// uses a display name such as `Taskly <no-reply@example.com>`.
function envelopeAddress(value, fallback = "") {
  const cleaned = String(value ?? "")
    .replace(/[\r\n]/g, "")
    .trim();
  const match = cleaned.match(/<([^<>]+)>/);
  return (match ? match[1] : cleaned).trim() || fallback;
}

export function smtpConfigured() {
  return readSmtpConfig() !== null;
}

function attachReader(socket) {
  let buffer = "";
  let pending = null;

  function flush() {
    if (!pending) return;

    const lines = buffer.split(/\r?\n/);
    let end = -1;
    for (let index = 0; index < lines.length; index += 1) {
      if (/^\d{3} /.test(lines[index])) {
        end = index;
        break;
      }
    }
    if (end === -1) return;

    const responseLines = lines.slice(0, end + 1);
    buffer = lines.slice(end + 1).join("\n");
    const response = {
      code: Number(responseLines[end].slice(0, 3)),
      text: responseLines.map((line) => line.slice(4)).join("\n"),
      lines: responseLines,
    };
    const next = pending;
    pending = null;
    next.resolve(response);
  }

  function onData(chunk) {
    buffer += chunk.toString("utf8");
    flush();
  }

  function onError(error) {
    if (pending) {
      pending.reject(error);
      pending = null;
    }
  }

  function onClose() {
    if (pending) {
      pending.reject(new Error("SMTP connection closed unexpectedly."));
      pending = null;
    }
  }

  socket.on("data", onData);
  socket.on("error", onError);
  socket.on("close", onClose);

  return {
    read() {
      return new Promise((resolve, reject) => {
        pending = { resolve, reject };
        flush();
      });
    },
    detach() {
      socket.off("data", onData);
      socket.off("error", onError);
      socket.off("close", onClose);
    },
  };
}

function connectSocket(config) {
  return new Promise((resolve, reject) => {
    const socket = config.secure
      ? tlsConnect({
          host: config.host,
          port: config.port,
          servername: config.host,
        })
      : netConnect({ host: config.host, port: config.port });

    const event = config.secure ? "secureConnect" : "connect";
    socket.setTimeout(SMTP_TIMEOUT, () => {
      socket.destroy(new Error("SMTP connection timed out."));
    });
    socket.once(event, () => resolve(socket));
    socket.once("error", reject);
  });
}

function upgradeToTls(socket, host) {
  return new Promise((resolve, reject) => {
    const secureSocket = tlsConnect({ socket, servername: host });
    secureSocket.setTimeout(SMTP_TIMEOUT, () => {
      secureSocket.destroy(new Error("SMTP TLS handshake timed out."));
    });
    secureSocket.once("secureConnect", () => resolve(secureSocket));
    secureSocket.once("error", reject);
  });
}

function createClient(socket, reader) {
  async function command(line, expected) {
    socket.write(`${line}\r\n`);
    const response = await reader.read();
    if (!expected.includes(response.code)) {
      throw new Error(
        `SMTP ${line.split(" ")[0]} failed (${response.code}): ${response.text}`,
      );
    }
    return response;
  }

  return { command };
}

async function authenticate(client, config, capabilities) {
  if (!config.user) return;

  if (capabilities.includes("auth")) {
    const plain = Buffer.from(
      `\0${config.user}\0${config.pass}`,
      "utf8",
    ).toString("base64");
    try {
      await client.command(`AUTH PLAIN ${plain}`, [235]);
      return;
    } catch {
      // Fall back to AUTH LOGIN below.
    }

    const login = await client.command("AUTH LOGIN", [334]);
    if (login.code === 334) {
      await client.command(Buffer.from(config.user, "utf8").toString("base64"), [
        334,
      ]);
      await client.command(
        Buffer.from(config.pass, "utf8").toString("base64"),
        [235],
      );
    }
  }
}

function buildMessage(config, to, subject, body) {
  const encodedSubject = `=?UTF-8?B?${Buffer.from(subject, "utf8").toString(
    "base64",
  )}?=`;
  return [
    `From: ${config.from}`,
    `To: ${to}`,
    `Subject: ${encodedSubject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="utf-8"',
    "Content-Transfer-Encoding: 8bit",
    `Date: ${new Date().toUTCString()}`,
    "",
    body,
  ].join("\r\n");
}

function dotStuff(message) {
  return message
    .split("\r\n")
    .map((line) => (line.startsWith(".") ? `.${line}` : line))
    .join("\r\n");
}

async function send(config, to, subject, body) {
  let socket = await connectSocket(config);
  let reader = attachReader(socket);

  try {
    const greeting = await reader.read();
    if (greeting.code !== 220) {
      throw new Error(`SMTP greeting failed (${greeting.code}).`);
    }

    let client = createClient(socket, reader);
    let ehlo = await client.command(`EHLO ${hostname() || "localhost"}`, [250]);
    let capabilities = ehlo.text.toLowerCase();

    if (config.starttls && !config.secure && capabilities.includes("starttls")) {
      await client.command("STARTTLS", [220]);
      reader.detach();
      socket = await upgradeToTls(socket, config.host);
      reader = attachReader(socket);
      client = createClient(socket, reader);
      ehlo = await client.command(`EHLO ${hostname() || "localhost"}`, [250]);
      capabilities = ehlo.text.toLowerCase();
    }

    await authenticate(client, config, capabilities);
    const fromAddress = envelopeAddress(config.from, config.user);
    const toAddress = envelopeAddress(to);
    if (!fromAddress || !toAddress) {
      throw new Error("SMTP needs valid sender and recipient addresses.");
    }
    await client.command(`MAIL FROM:<${fromAddress}>`, [250]);
    await client.command(`RCPT TO:<${toAddress}>`, [250, 251]);
    await client.command("DATA", [354]);

    const message = dotStuff(buildMessage(config, to, subject, body));
    socket.write(`${message}\r\n.\r\n`);
    const stored = await reader.read();
    if (stored.code !== 250) {
      throw new Error(`SMTP message delivery failed (${stored.code}).`);
    }

    try {
      await client.command("QUIT", [221]);
    } catch {
      // The message is already accepted; a failed QUIT is harmless.
    }
  } finally {
    reader.detach();
    socket.destroy();
  }
}

/** All deliveries share the same config guard and error-to-result mapping. */
async function withSmtp(buildMessage) {
  const config = readSmtpConfig();
  if (!config) return { sent: false, error: "SMTP is not configured." };

  const { to, subject, body } = buildMessage(config);
  try {
    await send(config, to, subject, body);
    return { sent: true, error: null };
  } catch (error) {
    return {
      sent: false,
      error: error instanceof Error ? error.message : "SMTP delivery failed.",
    };
  }
}

export async function sendInviteEmail({ to, teamName, inviterName, link }) {
  return withSmtp(() => ({
    to,
    subject: `${inviterName} invited you to ${teamName} on Taskly`,
    body: [
      `${inviterName} invited you to join the “${teamName}” team on Taskly.`,
      "",
      "Open this link on the Taskly server, sign in with this email address, and accept the invitation:",
      link,
      "",
      "If you were not expecting this invitation, you can ignore this message.",
    ].join("\r\n"),
  }));
}

export async function sendTestEmail({ to }) {
  return withSmtp((config) => ({
    to,
    subject: "Taskly SMTP test",
    body: [
      "This is a test message from your Taskly server.",
      "",
      `Sent at: ${new Date().toISOString()}`,
      `Server: ${config.host}:${config.port}`,
      "",
      "If you received this, invitation and password-reset emails can be delivered.",
    ].join("\r\n"),
  }));
}

export async function sendPasswordResetEmail({ to, name, link }) {
  return withSmtp(() => ({
    to,
    subject: "Reset your Taskly password",
    body: [
      `Hi ${name},`,
      "",
      "We received a request to reset the password for your Taskly account.",
      "Open this link to choose a new password:",
      link,
      "",
      "The link expires in one hour. If you were not expecting this message,",
      "you can ignore it and your password will stay the same.",
    ].join("\r\n"),
  }));
}
