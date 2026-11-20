import { describe, expect, it } from "vitest";
import { canManage } from "./taskPermissions";
import type { CompletedTask, Task } from "../types";

const task: Task = {
  id: "task_1",
  title: "Test",
  createdAt: 1,
  deadline: null,
  assigneeId: "user_1",
  progress: 0,
  progressLog: [],
};

const unassigned: Task = { ...task, assigneeId: null };
const otherAssignee: Task = { ...task, assigneeId: "user_2" };
const completed: CompletedTask = { ...task, completedAt: 2 };
const unassignedCompleted: CompletedTask = {
  ...unassigned,
  completedAt: 2,
};

describe("canManage", () => {
  it("allows every task in the private workspace", () => {
    expect(canManage("private", otherAssignee, "user_1")).toBe(true);
    expect(canManage("private", unassigned, "user_1")).toBe(true);
  });

  it("allows only the assignee for open team tasks", () => {
    expect(canManage("team", task, "user_1")).toBe(true);
    expect(canManage("team", otherAssignee, "user_1")).toBe(false);
    expect(canManage("team", unassigned, "user_1")).toBe(false);
  });

  it("allows claiming unassigned team work when requested", () => {
    expect(
      canManage("team", unassigned, "user_1", { allowUnassigned: true }),
    ).toBe(true);
    expect(
      canManage("team", otherAssignee, "user_1", { allowUnassigned: true }),
    ).toBe(false);
  });

  it("keeps unassigned history restorable by any member", () => {
    expect(
      canManage("team", unassignedCompleted, "user_1", {
        allowUnassigned: true,
      }),
    ).toBe(true);
    expect(canManage("team", completed, "user_2", { allowUnassigned: true })).toBe(
      false,
    );
  });

  it("rejects missing tasks", () => {
    expect(canManage("private", null, "user_1")).toBe(false);
    expect(canManage("team", undefined, "user_1")).toBe(false);
  });
});
