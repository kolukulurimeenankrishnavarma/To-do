import { createReadStream, promises as fs } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "./env.mjs";
import { HttpError, fail, sendJson, readBody } from "./http.mjs";
import { enforceTaskPermissions, requireHost, requireTeam } from "./permissions.mjs";
import { JsonStore } from "./db.mjs";
import { normalizeState, emptyState } from "./state.mjs";
import { sendInviteEmail, sendPasswordResetEmail, smtpConfigured } from "./smtp.mjs";
import { publicBase as buildPublicBase } from "./urls.mjs";
import {
  RESET_TOKEN_MAX_AGE,
  createPasswordRecord,
  createResetToken,
  hashSessionToken,
  newId,
  normalizeName,
  parseEmail,
  parsedOrFail,
  parseMobile,
  validateName,
  validateOrFail,
  validatePassword,
  verifyPassword,
} from "./validation.mjs";
import {
  getUser,
  getUserByEmail,
  isMember,
  memberIds,
  pendingInvites,
  requireExistingUser,
  sessionPayload,
} from "./views.mjs";
import {
  clientIdFrom,
  createSession,
  findSessionByToken,
  requireAuth,
} from "./sessions.mjs";

// Must run before any TASKLY_* constant below is read.
loadEnvFile();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const DIST = path.join(ROOT, "dist");
const DB_FILE = process.env.TASKLY_DB
  ? path.resolve(process.env.TASKLY_DB)
  : path.join(ROOT, "data", "db.json");
const PORT = Number(process.env.TASKLY_PORT || process.env.PORT || 8787);
const HOST = process.env.TASKLY_HOST || "127.0.0.1";
const TEST_MODE = process.env.TASKLY_TEST_MODE === "1";
const PUBLIC_URL = process.env.TASKLY_PUBLIC_URL ?? "";
const TRUST_PROXY = process.env.TASKLY_TRUST_PROXY === "1";

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

/** Every successful sign-in-like response has the same token/session shape. */
function sendSession(res, status, token, userId) {
  const db = store.get();
  sendJson(res, status, {
    token,
    session: sessionPayload(db, getUser(db, userId)),
  });
}

/** Notify affected clients once, then answer the mutating request. */
function commitAndNotify(
  res,
  {
    targets,
    exceptClientId = "",
    status = 200,
    payload = {},
    withRevision = false,
  },
) {
  broadcast(targets, exceptClientId);
  sendJson(res, status, {
    ok: true,
    ...payload,
    ...(withRevision ? { revision: store.get().revision } : {}),
  });
}

function publicBase(req) {
  return buildPublicBase(req, {
    configuredUrl: PUBLIC_URL,
    trustProxy: TRUST_PROXY,
    fallbackHost: `127.0.0.1:${PORT}`,
  });
}

/* ---------- Realtime connections ---------- */

const clients = new Set();

function removeClient(client) {
  if (client.heartbeat) clearInterval(client.heartbeat);
  clients.delete(client);
}

function broadcast(userIds, exceptClientId = "") {
  if (typeof userIds === "string") userIds = [userIds];
  const targets = new Set(userIds.filter(Boolean));
  if (targets.size === 0) return;

  const data = JSON.stringify({ revision: store.get().revision });
  for (const client of clients) {
    if (!targets.has(client.userId)) continue;
    if (exceptClientId && client.clientId === exceptClientId) continue;
    try {
      client.res.write(`event: change\ndata: ${data}\n\n`);
    } catch {
      removeClient(client);
    }
  }
}

function broadcastAll() {
  broadcast([...clients].map((client) => client.userId));
}

function openEvents(req, res, url) {
  const db = store.get();
  const found = findSessionByToken(db, url.searchParams.get("token") ?? "");

  if (!found) {
    sendJson(res, 401, { error: "Sign in to receive live updates." });
    return;
  }
  if (!found.user) {
    sendJson(res, 401, { error: "This account is no longer available." });
    return;
  }
  const user = found.user;

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write("retry: 2000\n\n");
  res.write(
    `event: ready\ndata: ${JSON.stringify({
      revision: db.revision,
    })}\n\n`,
  );

  const client = {
    res,
    userId: user.id,
    clientId: url.searchParams.get("client") ?? "",
    heartbeat: null,
  };
  client.heartbeat = setInterval(() => {
    try {
      res.write(": ping\n\n");
    } catch {
      removeClient(client);
    }
  }, 25_000);
  clients.add(client);

  const cleanup = () => removeClient(client);
  req.on("close", cleanup);
  res.on("close", cleanup);
  res.on("error", cleanup);
}

/* ---------- Route handlers ---------- */

async function handleRegister(req, res) {
  const body = await readBody(req);

  const emailInfo = parsedOrFail(parseEmail(body.email));
  validateOrFail(validatePassword(body.password));
  validateOrFail(validateName(body.name));
  const mobileInfo = parsedOrFail(parseMobile(body.mobile, body.countryDial));

  const record = await createPasswordRecord(body.password);
  const { email, key } = emailInfo;

  const result = await store.mutate((db) => {
    if (getUserByEmail(db, key)) {
      fail(409, `An account already exists for “${email}”. Sign in instead.`);
    }

    const user = {
      id: newId("user"),
      name: normalizeName(body.name),
      email,
      emailKey: key,
      mobile: mobileInfo.mobile,
      mobileKey: mobileInfo.key,
      ...record,
      createdAt: Date.now(),
    };

    db.users.push(user);
    db.data[user.id] = emptyState();
    const token = createSession(db, user.id);
    return { token, userId: user.id };
  });

  sendSession(res, 201, result.token, result.userId);
}

async function handleLogin(req, res) {
  const body = await readBody(req);

  const emailInfo = parsedOrFail(parseEmail(body.email));
  validateOrFail(validatePassword(body.password));

  const db = store.get();
  const user = getUserByEmail(db, emailInfo.key);
  if (!user) {
    fail(404, `No account found for “${emailInfo.email}”.`);
  }

  const valid = await verifyPassword(body.password, user);
  if (!valid) {
    fail(401, `Incorrect password for “${user.email}”.`);
  }

  const token = await store.mutate((current) => {
    requireExistingUser(current, user.id, 404, "This account is no longer available.");
    return createSession(current, user.id);
  });

  sendSession(res, 200, token, user.id);
}

async function handleForgotPassword(req, res) {
  const body = await readBody(req);

  const parsed = parsedOrFail(parseEmail(body.email));

  const now = Date.now();
  const result = await store.mutate((db) => {
    const user = getUserByEmail(db, parsed.key);
    if (!user) return null;

    const token = createResetToken();
    // Only the newest link should work, and expired links are discarded.
    db.passwordResets = db.passwordResets.filter(
      (entry) => entry.expiresAt > now && entry.userId !== user.id,
    );
    db.passwordResets.push({
      tokenHash: hashSessionToken(token),
      userId: user.id,
      createdAt: now,
      expiresAt: now + RESET_TOKEN_MAX_AGE,
    });

    return { token, user };
  });

  // Always answer successfully so the endpoint does not reveal whether an
  // account exists. Local/no-SMTP setups get the link directly so the flow
  // stays fully usable without email delivery.
  if (!result) {
    sendJson(res, 200, { ok: true, emailSent: false, emailError: null });
    return;
  }

  const resetUrl = `${publicBase(req)}/?reset=${encodeURIComponent(
    result.token,
  )}`;
  const configured = smtpConfigured();
  const delivery = await sendPasswordResetEmail({
    to: result.user.email,
    name: result.user.name,
    link: resetUrl,
  });

  sendJson(res, 200, {
    ok: true,
    resetUrl: configured ? undefined : resetUrl,
    emailSent: delivery.sent,
    emailError: delivery.error,
  });
}

async function handleResetPassword(req, res, clientId) {
  const body = await readBody(req);
  const token = String(body.token ?? "");
  if (!token) fail(400, "This reset link is invalid or has expired.");

  validateOrFail(validatePassword(body.password));

  const tokenHash = hashSessionToken(token);
  const record = await createPasswordRecord(body.password);
  const now = Date.now();

  const result = await store.mutate((db) => {
    const reset = db.passwordResets.find(
      (entry) => entry.tokenHash === tokenHash && entry.expiresAt > now,
    );
    if (!reset) fail(400, "This reset link is invalid or has expired.");

    const user = getUser(db, reset.userId);
    if (!user) fail(400, "This reset link is invalid or has expired.");

    user.salt = record.salt;
    user.hash = record.hash;
    user.iterations = record.iterations;

    // Changing the password signs out every existing session.
    db.sessions = db.sessions.filter((entry) => entry.userId !== user.id);
    db.passwordResets = db.passwordResets.filter(
      (entry) => entry.userId !== user.id,
    );

    const sessionToken = createSession(db, user.id);
    return { token: sessionToken, userId: user.id };
  });

  broadcast([result.userId], clientId);
  sendSession(res, 200, result.token, result.userId);
}

async function handleCreateTeam(req, res, auth, clientId) {
  const body = await readBody(req);
  const name = normalizeName(body.name).slice(0, 80);

  const team = await store.mutate((db) => {
    const user = requireExistingUser(
      db,
      auth.user.id,
      401,
      "Your account is no longer available.",
    );

    const now = Date.now();
    const created = {
      id: newId("team"),
      name: name || `${user.name}'s team`,
      hostId: user.id,
      createdAt: now,
      members: [{ userId: user.id, role: "host", joinedAt: now }],
      invites: [],
      state: emptyState(),
    };
    db.teams.push(created);
    return created;
  });

  commitAndNotify(res, {
    targets: [auth.user.id],
    exceptClientId: clientId,
    status: 201,
    payload: { teamId: team.id },
  });
}

async function handleInvite(req, res, auth, teamId, clientId) {
  const body = await readBody(req);

  const { email, key } = parsedOrFail(parseEmail(body.email));

  const result = await store.mutate((db) => {
    const team = requireTeam(db, teamId);
    requireHost(team, auth.user.id, "invite teammates");

    const existing = getUserByEmail(db, key);
    if (existing && isMember(team, existing.id)) {
      fail(409, `${existing.name} is already on this team.`);
    }

    const duplicate = pendingInvites(team).some(
      (invite) => invite.emailKey === key,
    );
    if (duplicate) {
      fail(409, `An invitation for “${email}” is already pending.`);
    }

    const invite = {
      id: newId("invite"),
      email,
      emailKey: key,
      invitedByUserId: auth.user.id,
      createdAt: Date.now(),
      status: "pending",
      respondedAt: null,
      acceptedByUserId: null,
    };
    team.invites.unshift(invite);

    return {
      invite,
      teamName: team.name,
      inviteeId: existing ? existing.id : null,
    };
  });

  const base = publicBase(req);
  const inviteUrl = `${base}/?invite=${encodeURIComponent(result.invite.id)}`;

  const delivery = await sendInviteEmail({
    to: email,
    teamName: result.teamName,
    inviterName: auth.user.name,
    link: inviteUrl,
  });

  commitAndNotify(res, {
    targets: [auth.user.id, result.inviteeId],
    exceptClientId: clientId,
    payload: {
      teamId,
      invite: result.invite,
      inviteUrl,
      emailSent: delivery.sent,
      emailError: delivery.error,
    },
  });
}

async function handleInviteResponse(
  req,
  res,
  auth,
  teamId,
  inviteId,
  action,
  clientId,
) {
  const result = await store.mutate((db) => {
    const team = requireTeam(db, teamId);

    const invite = team.invites.find(
      (entry) => entry.id === inviteId && entry.status === "pending",
    );
    if (!invite) fail(404, "This invitation is no longer available.");

    if (invite.emailKey !== auth.user.emailKey) {
      fail(
        403,
        `This invitation was sent to ${invite.email}. Sign in with that email to respond.`,
      );
    }

    if (action === "accept") {
      if (isMember(team, auth.user.id)) {
        fail(409, "You're already on this team.");
      }
      team.members.push({
        userId: auth.user.id,
        role: "member",
        joinedAt: Date.now(),
      });
      invite.status = "accepted";
      invite.respondedAt = Date.now();
      invite.acceptedByUserId = auth.user.id;
    } else {
      invite.status = "declined";
      invite.respondedAt = Date.now();
    }

    return memberIds(team);
  });

  commitAndNotify(res, {
    targets: [...result, auth.user.id],
    exceptClientId: clientId,
    payload: { teamId },
  });
}

async function handleCancelInvite(req, res, auth, teamId, inviteId, clientId) {
  const result = await store.mutate((db) => {
    const team = requireTeam(db, teamId);
    requireHost(team, auth.user.id, "cancel invitations");

    const invite = team.invites.find(
      (entry) => entry.id === inviteId && entry.status === "pending",
    );
    if (!invite) fail(404, "This invitation is no longer pending.");

    team.invites = team.invites.filter((entry) => entry.id !== inviteId);
    const invitee = getUserByEmail(db, invite.emailKey);
    return { members: memberIds(team), inviteeId: invitee ? invitee.id : null };
  });

  commitAndNotify(res, {
    targets: [...result.members, result.inviteeId],
    exceptClientId: clientId,
    payload: { teamId },
  });
}

async function handleRemoveMember(req, res, auth, teamId, memberId, clientId) {
  const result = await store.mutate((db) => {
    const team = requireTeam(db, teamId);
    requireHost(team, auth.user.id, "remove teammates");

    if (memberId === auth.user.id) {
      fail(400, "Delete the team instead of removing yourself.");
    }

    if (!isMember(team, memberId)) {
      fail(404, "That person is not a member of this team.");
    }

    team.members = team.members.filter(
      (member) => member.userId !== memberId,
    );
    // Completed work stays in history, but open work returns to the pool so
    // the team does not lose track of tasks the removed member owned.
    team.state.tasks = team.state.tasks.map((task) =>
      task.assigneeId === memberId ? { ...task, assigneeId: null } : task,
    );

    return { members: memberIds(team), removedId: memberId };
  });

  commitAndNotify(res, {
    targets: [...result.members, result.removedId],
    exceptClientId: clientId,
    payload: { teamId },
  });
}

async function handleDeleteTeam(req, res, auth, teamId, clientId) {
  const members = await store.mutate((db) => {
    const team = requireTeam(db, teamId);
    requireHost(team, auth.user.id, "delete this team");

    const ids = memberIds(team);
    db.teams = db.teams.filter((entry) => entry.id !== teamId);
    return ids;
  });

  commitAndNotify(res, { targets: members, exceptClientId: clientId });
}

async function handleApi(req, res, url) {
  const method = req.method ?? "GET";
  const route = url.pathname;
  const clientId = clientIdFrom(req);
  const db = store.get();

  if (method === "GET" && route === "/api/health") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (method === "GET" && route === "/api/meta") {
    sendJson(res, 200, {
      hasAccounts: db.users.length > 0,
      smtpConfigured: smtpConfigured(),
    });
    return;
  }

  if (method === "GET" && route === "/api/events") {
    openEvents(req, res, url);
    return;
  }

  if (method === "POST" && route === "/api/test/reset" && TEST_MODE) {
    await store.reset();
    broadcastAll();
    sendJson(res, 200, { ok: true });
    return;
  }

  if (method === "GET" && route === "/api/check-email") {
    const parsed = parseEmail(url.searchParams.get("email") ?? "");
    sendJson(res, 200, {
      valid: parsed.ok,
      exists: parsed.ok ? Boolean(getUserByEmail(db, parsed.value.key)) : false,
    });
    return;
  }

  if (method === "POST" && route === "/api/auth/register") {
    await handleRegister(req, res);
    return;
  }

  if (method === "POST" && route === "/api/auth/login") {
    await handleLogin(req, res);
    return;
  }

  if (method === "POST" && route === "/api/auth/forgot-password") {
    await handleForgotPassword(req, res);
    return;
  }

  if (method === "POST" && route === "/api/auth/reset-password") {
    await handleResetPassword(req, res, clientId);
    return;
  }

  if (method === "GET" && route === "/api/session") {
    const auth = requireAuth(db, req);
    sendJson(res, 200, sessionPayload(db, auth.user));
    return;
  }

  if (method === "POST" && route === "/api/auth/logout") {
    const auth = requireAuth(db, req);
    await store.mutate((current) => {
      current.sessions = current.sessions.filter(
        (entry) => entry.tokenHash !== auth.tokenHash,
      );
    });
    sendJson(res, 200, { ok: true });
    return;
  }

  if (method === "PUT" && route === "/api/private-state") {
    const auth = requireAuth(db, req);
    const body = await readBody(req);
    const next = normalizeState(body.state);

    await store.mutate((current) => {
      requireExistingUser(current, auth.user.id, 401, "Your account is no longer available.");
      current.data[auth.user.id] = next;
    });

    commitAndNotify(res, {
      targets: [auth.user.id],
      exceptClientId: clientId,
      withRevision: true,
    });
    return;
  }

  if (method === "POST" && route === "/api/teams") {
    const auth = requireAuth(db, req);
    await handleCreateTeam(req, res, auth, clientId);
    return;
  }

  const teamStateMatch = route.match(/^\/api\/teams\/([^/]+)\/state$/);
  if (method === "PUT" && teamStateMatch) {
    const auth = requireAuth(db, req);
    const teamId = decodeURIComponent(teamStateMatch[1]);
    const body = await readBody(req);
    const next = normalizeState(body.state);

    const members = await store.mutate((current) => {
      const team = requireTeam(current, teamId);
      if (!isMember(team, auth.user.id)) {
        fail(403, "You are not a member of this team.");
      }

      // A save prepared before a member was removed can arrive afterwards.
      // Never let that stale snapshot reassign open work to a former member.
      const currentMembers = new Set(memberIds(team));
      next.tasks = next.tasks.map((task) =>
        task.assigneeId && !currentMembers.has(task.assigneeId)
          ? { ...task, assigneeId: null }
          : task,
      );

      enforceTaskPermissions(team, next, auth.user.id);
      team.state = next;
      return memberIds(team);
    });

    commitAndNotify(res, {
      targets: members,
      exceptClientId: clientId,
      withRevision: true,
    });
    return;
  }

  const invitesMatch = route.match(/^\/api\/teams\/([^/]+)\/invites$/);
  if (method === "POST" && invitesMatch) {
    const auth = requireAuth(db, req);
    await handleInvite(
      req,
      res,
      auth,
      decodeURIComponent(invitesMatch[1]),
      clientId,
    );
    return;
  }

  const inviteActionMatch = route.match(
    /^\/api\/teams\/([^/]+)\/invites\/([^/]+)\/(accept|decline)$/,
  );
  if (method === "POST" && inviteActionMatch) {
    const auth = requireAuth(db, req);
    await handleInviteResponse(
      req,
      res,
      auth,
      decodeURIComponent(inviteActionMatch[1]),
      decodeURIComponent(inviteActionMatch[2]),
      inviteActionMatch[3],
      clientId,
    );
    return;
  }

  const inviteDeleteMatch = route.match(
    /^\/api\/teams\/([^/]+)\/invites\/([^/]+)$/,
  );
  if (method === "DELETE" && inviteDeleteMatch) {
    const auth = requireAuth(db, req);
    await handleCancelInvite(
      req,
      res,
      auth,
      decodeURIComponent(inviteDeleteMatch[1]),
      decodeURIComponent(inviteDeleteMatch[2]),
      clientId,
    );
    return;
  }

  const teamMemberMatch = route.match(
    /^\/api\/teams\/([^/]+)\/members\/([^/]+)$/,
  );
  if (method === "DELETE" && teamMemberMatch) {
    const auth = requireAuth(db, req);
    await handleRemoveMember(
      req,
      res,
      auth,
      decodeURIComponent(teamMemberMatch[1]),
      decodeURIComponent(teamMemberMatch[2]),
      clientId,
    );
    return;
  }

  const teamDeleteMatch = route.match(/^\/api\/teams\/([^/]+)$/);
  if (method === "DELETE" && teamDeleteMatch) {
    const auth = requireAuth(db, req);
    await handleDeleteTeam(
      req,
      res,
      auth,
      decodeURIComponent(teamDeleteMatch[1]),
      clientId,
    );
    return;
  }

  fail(404, "Not found.");
}

/* ---------- Static files ---------- */

async function serveStatic(req, res, url) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    fail(405, "Method not allowed.");
  }

  let relative = url.pathname === "/" ? "index.html" : url.pathname;
  try {
    relative = decodeURIComponent(relative);
  } catch {
    fail(400, "Invalid path.");
  }
  relative = relative.replace(/^\/+/, "");

  let filePath = path.resolve(DIST, relative);
  if (filePath !== DIST && !filePath.startsWith(`${DIST}${path.sep}`)) {
    fail(403, "Forbidden.");
  }

  let stat = null;
  try {
    stat = await fs.stat(filePath);
  } catch {
    stat = null;
  }

  if (!stat || stat.isDirectory()) {
    const acceptsHtml = String(req.headers.accept ?? "").includes("text/html");
    if (!acceptsHtml) fail(404, "Not found.");
    filePath = path.join(DIST, "index.html");
    try {
      stat = await fs.stat(filePath);
    } catch {
      res.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(
        "Taskly API is running. Build the web app first with `npm run build`, then restart the server.",
      );
      return;
    }
  }

  const type =
    MIME_TYPES[path.extname(filePath).toLowerCase()] ??
    "application/octet-stream";
  res.writeHead(200, {
    "Content-Type": type,
    "Content-Length": stat.size,
    "Cache-Control": filePath.endsWith("index.html")
      ? "no-store"
      : "public, max-age=31536000, immutable",
  });

  if (req.method === "HEAD") {
    res.end();
    return;
  }

  createReadStream(filePath)
    .on("error", () => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    })
    .pipe(res);
}

/* ---------- Server ---------- */

const store = new JsonStore(DB_FILE);
await store.init();

const server = http.createServer(async (req, res) => {
  const url = new URL(
    req.url ?? "/",
    `http://${req.headers.host ?? `127.0.0.1:${PORT}`}`,
  );

  try {
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }
    await serveStatic(req, res, url);
  } catch (error) {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    const status = error instanceof HttpError ? error.status : 500;
    if (status >= 500) console.error(error);
    sendJson(res, status, {
      error:
        error instanceof HttpError
          ? error.message
          : "Something went wrong on the Taskly server.",
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Taskly server listening on http://${HOST}:${PORT}`);
  console.log(`Data file: ${DB_FILE}`);
  console.log(
    `Realtime updates: SSE at /api/events · Test mode: ${
      TEST_MODE ? "on" : "off"
    }`,
  );
});

function shutdown() {
  for (const client of clients) {
    removeClient(client);
    try {
      client.res.end();
    } catch {
      // Ignore closed connections.
    }
  }
  clients.clear();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
