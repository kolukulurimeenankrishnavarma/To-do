import { fail } from "./http.mjs";
import {
  SESSION_MAX_AGE,
  createSessionToken,
  hashSessionToken,
} from "./validation.mjs";
import { getUser } from "./views.mjs";

export function getBearer(req) {
  const header = req.headers.authorization;
  if (typeof header !== "string" || !header.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}

/**
 * Shared HTTP/SSE session lookup. A session whose user was deleted is returned
 * with `user: null` so each caller can keep its own 401 message.
 */
export function findSessionByToken(db, token) {
  const tokenHash = hashSessionToken(token);
  const session = db.sessions.find((entry) => entry.tokenHash === tokenHash);
  if (!session) return null;
  return { user: getUser(db, session.userId), session, tokenHash };
}

export function getAuth(db, req) {
  const token = getBearer(req);
  if (!token) return null;

  const found = findSessionByToken(db, token);
  return found?.user ? found : null;
}

export function requireAuth(db, req) {
  const auth = getAuth(db, req);
  if (!auth) fail(401, "Sign in to continue.");
  return auth;
}

export function clientIdFrom(req) {
  const value = req.headers["x-taskly-client"];
  return typeof value === "string" ? value : "";
}

export function createSession(db, userId) {
  const token = createSessionToken();
  const now = Date.now();
  db.sessions = db.sessions.filter(
    (entry) => now - entry.createdAt < SESSION_MAX_AGE,
  );
  db.sessions.push({
    tokenHash: hashSessionToken(token),
    userId,
    createdAt: now,
  });
  return token;
}
