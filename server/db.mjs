import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { emptyInsights, normalizeInsights } from "./insights.mjs";
import { emptyState, normalizeState } from "./state.mjs";
import { SESSION_MAX_AGE } from "./validation.mjs";

const DB_VERSION = 7;

function isRecord(value) {
  return typeof value === "object" && value !== null;
}

export function emptyDb() {
  return {
    version: DB_VERSION,
    revision: 0,
    users: [],
    data: {},
    insights: {},
    teams: [],
    sessions: [],
    passwordResets: [],
  };
}

function normalizeInvite(value) {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== "string" ||
    typeof value.emailKey !== "string" ||
    typeof value.email !== "string" ||
    typeof value.invitedByUserId !== "string" ||
    typeof value.createdAt !== "number"
  ) {
    return null;
  }

  return {
    id: value.id,
    email: value.email,
    emailKey: value.emailKey,
    invitedByUserId: value.invitedByUserId,
    createdAt: value.createdAt,
    status:
      value.status === "accepted" || value.status === "declined"
        ? value.status
        : "pending",
    respondedAt:
      typeof value.respondedAt === "number" ? value.respondedAt : null,
    acceptedByUserId:
      typeof value.acceptedByUserId === "string"
        ? value.acceptedByUserId
        : null,
  };
}

function normalizeTeam(value) {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  if (typeof value.hostId !== "string" || !Array.isArray(value.members)) {
    return null;
  }

  const members = value.members
    .filter(
      (member) =>
        isRecord(member) &&
        typeof member.userId === "string" &&
        typeof member.joinedAt === "number",
    )
    .map((member) => ({
      userId: member.userId,
      role: member.userId === value.hostId ? "host" : "member",
      joinedAt: member.joinedAt,
    }));

  if (members.length === 0) return null;
  if (!members.some((member) => member.userId === value.hostId)) return null;

  return {
    id: value.id,
    name:
      typeof value.name === "string" && value.name.trim()
        ? value.name.trim().slice(0, 80)
        : "Team",
    hostId: value.hostId,
    createdAt:
      typeof value.createdAt === "number" ? value.createdAt : Date.now(),
    members,
    invites: Array.isArray(value.invites)
      ? value.invites.map(normalizeInvite).filter(Boolean)
      : [],
    state: normalizeState(value.state),
  };
}

function normalizeUser(value) {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.email !== "string" ||
    typeof value.emailKey !== "string" ||
    typeof value.name !== "string" ||
    typeof value.salt !== "string" ||
    typeof value.hash !== "string" ||
    typeof value.createdAt !== "number"
  ) {
    return null;
  }

  return {
    id: value.id,
    name: value.name,
    email: value.email,
    emailKey: value.emailKey,
    mobile: typeof value.mobile === "string" ? value.mobile : "",
    mobileKey: typeof value.mobileKey === "string" ? value.mobileKey : "",
    salt: value.salt,
    hash: value.hash,
    iterations:
      typeof value.iterations === "number" ? value.iterations : 150_000,
    createdAt: value.createdAt,
  };
}

function normalizePasswordReset(value, now) {
  if (
    !isRecord(value) ||
    typeof value.tokenHash !== "string" ||
    typeof value.userId !== "string" ||
    typeof value.createdAt !== "number" ||
    typeof value.expiresAt !== "number"
  ) {
    return null;
  }

  if (value.expiresAt <= now) return null;

  return {
    tokenHash: value.tokenHash,
    userId: value.userId,
    createdAt: value.createdAt,
    expiresAt: value.expiresAt,
  };
}

function normalizeDb(value) {
  if (!isRecord(value)) return emptyDb();

  const users = Array.isArray(value.users)
    ? value.users.map(normalizeUser).filter(Boolean)
    : [];
  const userIds = new Set(users.map((user) => user.id));

  const data = {};
  const insights = {};
  for (const user of users) {
    data[user.id] = isRecord(value.data)
      ? normalizeState(value.data[user.id])
      : emptyState();
    insights[user.id] = isRecord(value.insights)
      ? normalizeInsights(value.insights[user.id])
      : emptyInsights();
  }

  const teams = Array.isArray(value.teams)
    ? value.teams
        .map(normalizeTeam)
        .filter(
          (team) =>
            team &&
            team.members.every((member) => userIds.has(member.userId)),
        )
    : [];

  const now = Date.now();
  const sessions = Array.isArray(value.sessions)
    ? value.sessions.filter(
        (session) =>
          isRecord(session) &&
          typeof session.tokenHash === "string" &&
          typeof session.userId === "string" &&
          userIds.has(session.userId) &&
          typeof session.createdAt === "number" &&
          now - session.createdAt < SESSION_MAX_AGE,
      )
    : [];

  const passwordResets = Array.isArray(value.passwordResets)
    ? value.passwordResets
        .map((reset) => normalizePasswordReset(reset, now))
        .filter((reset) => reset && userIds.has(reset.userId))
    : [];

  return {
    version: DB_VERSION,
    revision:
      typeof value.revision === "number" && Number.isFinite(value.revision)
        ? value.revision
        : 0,
    users,
    data,
    insights,
    teams,
    sessions,
    passwordResets,
  };
}

export class JsonStore {
  constructor(file) {
    this.file = path.resolve(file);
    this.db = emptyDb();
    this.queue = Promise.resolve();
  }

  async init() {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    try {
      const raw = await fs.readFile(this.file, "utf8");
      this.db = normalizeDb(JSON.parse(raw));
    } catch (error) {
      if (error && error.code !== "ENOENT") {
        console.error("Could not read the data file. Starting with empty data.");
        console.error(error);
      }
      this.db = emptyDb();
    }
    await this.persist();
  }

  get() {
    return this.db;
  }

  async persist() {
    const tempFile = `${this.file}.${process.pid}.${randomBytes(4).toString(
      "hex",
    )}.tmp`;
    const payload = JSON.stringify(this.db, null, 2);
    await fs.writeFile(tempFile, payload, "utf8");
    await fs.rename(tempFile, this.file);
  }

  /**
   * Serialize every mutation. JSON on disk is a single-writer store, so a
   * read-modify-write cycle must never overlap in this process.
   */
  mutate(fn) {
    const run = this.queue.then(async () => {
      const result = await fn(this.db);
      this.db.revision += 1;
      await this.persist();
      return result;
    });

    this.queue = run.catch(() => {});
    return run;
  }

  async reset() {
    return this.mutate((db) => {
      const fresh = emptyDb();
      Object.assign(db, fresh);
    });
  }
}
