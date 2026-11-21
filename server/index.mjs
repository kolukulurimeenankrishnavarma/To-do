import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "./env.mjs";
import { HttpError, fail, sendJson } from "./http.mjs";
import { createEvents } from "./sse.mjs";
import { createResponses } from "./responses.mjs";
import { createStaticFiles } from "./staticFiles.mjs";
import { JsonStore } from "./db.mjs";
import { smtpConfigured } from "./smtp.mjs";
import { publicBase as buildPublicBase } from "./urls.mjs";
import { parseEmail } from "./validation.mjs";
import { getUserByEmail, sessionPayload } from "./views.mjs";
import { clientIdFrom, requireAuth } from "./sessions.mjs";
import { createAuthRoutes } from "./authRoutes.mjs";
import { createInsightRoutes } from "./insightRoutes.mjs";
import { createTeamRoutes } from "./teamRoutes.mjs";

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

function publicBase(req) {
  return buildPublicBase(req, {
    configuredUrl: PUBLIC_URL,
    trustProxy: TRUST_PROXY,
    fallbackHost: `127.0.0.1:${PORT}`,
  });
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
    events.openEvents(req, res, url);
    return;
  }

  if (method === "POST" && route === "/api/test/reset" && TEST_MODE) {
    await store.reset();
    events.broadcastAll();
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
    await authRoutes.register(req, res);
    return;
  }

  if (method === "POST" && route === "/api/auth/login") {
    await authRoutes.login(req, res);
    return;
  }

  if (method === "POST" && route === "/api/auth/forgot-password") {
    await authRoutes.forgotPassword(req, res);
    return;
  }

  if (method === "POST" && route === "/api/auth/reset-password") {
    await authRoutes.resetPassword(req, res, clientId);
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

  if (method === "GET" && route === "/api/insights") {
    const auth = requireAuth(db, req);
    insightRoutes.getInsights(req, res, auth);
    return;
  }

  if (method === "PUT" && route === "/api/insights") {
    const auth = requireAuth(db, req);
    await insightRoutes.saveInsights(req, res, auth, clientId);
    return;
  }

  if (method === "PUT" && route === "/api/private-state") {
    const auth = requireAuth(db, req);
    await teamRoutes.updatePrivateState(req, res, auth, clientId);
    return;
  }

  if (method === "POST" && route === "/api/teams") {
    const auth = requireAuth(db, req);
    await teamRoutes.createTeam(req, res, auth, clientId);
    return;
  }

  const teamStateMatch = route.match(/^\/api\/teams\/([^/]+)\/state$/);
  if (method === "PUT" && teamStateMatch) {
    const auth = requireAuth(db, req);
    await teamRoutes.updateTeamState(
      req,
      res,
      auth,
      decodeURIComponent(teamStateMatch[1]),
      clientId,
    );
    return;
  }

  const invitesMatch = route.match(/^\/api\/teams\/([^/]+)\/invites$/);
  if (method === "POST" && invitesMatch) {
    const auth = requireAuth(db, req);
    await teamRoutes.invite(
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
    await teamRoutes.inviteResponse(
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
    await teamRoutes.cancelInvite(
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
    await teamRoutes.removeMember(
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
    await teamRoutes.deleteTeam(
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

/* ---------- Server ---------- */

const store = new JsonStore(DB_FILE);
await store.init();

const events = createEvents({ store });
const responses = createResponses({ store, broadcast: events.broadcast });
const staticFiles = createStaticFiles({ dist: DIST });
const authRoutes = createAuthRoutes({ store, responses, events, publicBase });
const insightRoutes = createInsightRoutes({ store, responses });
const teamRoutes = createTeamRoutes({ store, responses, publicBase });

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
    await staticFiles.serveStatic(req, res, url);
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
  events.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
