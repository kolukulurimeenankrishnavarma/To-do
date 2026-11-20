import { describe, expect, it } from "vitest";
import { HttpError } from "./http.mjs";
import {
  enforceTaskPermissions,
  requireHost,
  requireTeam,
} from "./permissions.mjs";

function task(id, overrides = {}) {
  return {
    id,
    title: `Task ${id}`,
    createdAt: 1,
    updatedAt: 1,
    deadline: null,
    assigneeId: null,
    progress: 0,
    progressLog: [],
    ...overrides,
  };
}

function makeTeam(tasks, history = []) {
  return {
    id: "team-1",
    name: "Test team",
    hostId: "host",
    members: [
      { userId: "host", role: "host", joinedAt: 0 },
      { userId: "alice", role: "member", joinedAt: 0 },
      { userId: "bob", role: "member", joinedAt: 0 },
    ],
    invites: [],
    state: { tasks, history },
  };
}

function snapshot(team) {
  return structuredClone(team.state);
}

function expectForbidden(action, message) {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(HttpError);
    expect(error.status).toBe(403);
    expect(error.message).toBe(message);
    return;
  }
  throw new Error(`Expected ${message}`);
}

describe("enforceTaskPermissions", () => {
  it("lets any member comment or reassign without changing owned fields", () => {
    const team = makeTeam([task("t1", { assigneeId: "alice", progress: 25 })]);
    const next = snapshot(team);
    next.tasks[0].assigneeId = "bob";
    next.tasks[0].progressLog.push({ at: 2, progress: 25, note: "Looking" });

    expect(() => enforceTaskPermissions(team, next, "bob")).not.toThrow();
  });

  it("allows progress and rename only for the assigned member", () => {
    const team = makeTeam([task("t1", { assigneeId: "alice", progress: 25 })]);

    const progressChange = snapshot(team);
    progressChange.tasks[0].progress = 50;
    expectForbidden(
      () => enforceTaskPermissions(team, progressChange, "bob"),
      "Only the assigned member can change this task's progress.",
    );
    expect(() =>
      enforceTaskPermissions(team, progressChange, "alice"),
    ).not.toThrow();

    const rename = snapshot(team);
    rename.tasks[0].title = "Renamed";
    expectForbidden(
      () => enforceTaskPermissions(team, rename, "bob"),
      "Only the assigned member can rename this task.",
    );
    expect(() => enforceTaskPermissions(team, rename, "alice")).not.toThrow();
  });

  it("allows completion and deletion only for the assigned member", () => {
    const team = makeTeam([task("t1", { assigneeId: "alice" })]);

    const completed = { tasks: [], history: [task("t1", { assigneeId: "alice", completedAt: 2 })] };
    expectForbidden(
      () => enforceTaskPermissions(team, completed, "bob"),
      "Only the assigned member can complete this task.",
    );
    expect(() => enforceTaskPermissions(team, completed, "alice")).not.toThrow();

    const deleted = { tasks: [], history: [] };
    expectForbidden(
      () => enforceTaskPermissions(team, deleted, "bob"),
      "Only the assigned member can delete this task.",
    );
    expect(() => enforceTaskPermissions(team, deleted, "alice")).not.toThrow();
  });

  it("claims an unassigned task when a member finishes it", () => {
    const team = makeTeam([task("t1")]);
    const completed = { tasks: [], history: [task("t1", { completedAt: 2 })] };

    enforceTaskPermissions(team, completed, "alice");
    expect(completed.history[0].assigneeId).toBe("alice");
  });

  it("allows restore and history removal only for the assigned member", () => {
    const team = makeTeam(
      [],
      [task("t1", { assigneeId: "alice", completedAt: 2 })],
    );

    const restored = { tasks: [task("t1", { assigneeId: "alice" })], history: [] };
    expectForbidden(
      () => enforceTaskPermissions(team, restored, "bob"),
      "Only the assigned member can restore this task.",
    );
    expect(() => enforceTaskPermissions(team, restored, "alice")).not.toThrow();

    const removed = { tasks: [], history: [] };
    expectForbidden(
      () => enforceTaskPermissions(team, removed, "bob"),
      "Only the assigned member can remove this task from history.",
    );
    expect(() => enforceTaskPermissions(team, removed, "alice")).not.toThrow();
  });
});

describe("team guards", () => {
  it("keeps the exact host-only error messages", () => {
    const team = makeTeam([]);
    expectForbidden(
      () => requireHost(team, "bob", "invite teammates"),
      "Only the team host can invite teammates.",
    );
    expect(() => requireHost(team, "host", "invite teammates")).not.toThrow();
  });

  it("returns the shared missing-team error", () => {
    try {
      requireTeam({ teams: [] }, "missing");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      expect(error.status).toBe(404);
      expect(error.message).toBe("This team is no longer available.");
      return;
    }
    throw new Error("Expected a 404");
  });
});
