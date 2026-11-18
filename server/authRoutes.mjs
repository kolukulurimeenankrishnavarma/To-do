import { fail, readBody, sendJson } from "./http.mjs";
import { emptyState } from "./state.mjs";
import { sendPasswordResetEmail, smtpConfigured } from "./smtp.mjs";
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
import { getUser, getUserByEmail, requireExistingUser } from "./views.mjs";
import { createSession } from "./sessions.mjs";

export function createAuthRoutes({ store, responses, events, publicBase }) {
  async function register(req, res) {
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

    responses.sendSession(res, 201, result.token, result.userId);
  }

  async function login(req, res) {
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

    responses.sendSession(res, 200, token, user.id);
  }

  async function forgotPassword(req, res) {
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

  async function resetPassword(req, res, clientId) {
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

    events.broadcast([result.userId], clientId);
    responses.sendSession(res, 200, result.token, result.userId);
  }

  return { register, login, forgotPassword, resetPassword };
}
