import { describe, expect, it } from "vitest";
import {
  appendProgressEntry,
  clampProgress,
  normalizeNote,
} from "./progress";
import {
  completionEntry,
  filterTasks,
  isActive,
  isOverdue,
  isPending,
  sortTasks,
  taskStats,
} from "./tasks";
import type { CompletedTask, Task } from "../types";

const now = 1_700_000_000_000;

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task",
    title: "Task",
    createdAt: now,
    deadline: null,
    assigneeId: null,
    progress: 0,
    progressLog: [],
    ...overrides,
  };
}

describe("progress helpers", () => {
  it("clamps to 0-100 in 5-point steps", () => {
    expect(clampProgress(-20)).toBe(0);
    expect(clampProgress(43)).toBe(45);
    expect(clampProgress(102)).toBe(100);
    expect(clampProgress(Number.NaN)).toBe(0);
  });

  it("trims and limits notes", () => {
    expect(normalizeNote("  hello  ")).toBe("hello");
    expect(normalizeNote("x".repeat(400))).toHaveLength(280);
  });

  it("appends a progress entry and records the author", () => {
    const task = appendProgressEntry(
      makeTask(),
      40,
      now,
      "  first note  ",
      "user_1",
    );

    expect(task.progress).toBe(40);
    expect(task.progressLog).toEqual([
      { value: 40, at: now, note: "first note", by: "user_1" },
    ]);
  });

  it("keeps only the latest 100 progress entries", () => {
    let task = makeTask();

    for (let index = 0; index < 105; index += 1) {
      task = appendProgressEntry(task, index % 100, now + index, `note ${index}`);
    }

    expect(task.progressLog).toHaveLength(100);
    expect(task.progressLog[0].at).toBe(now + 5);
  });
});

describe("completionEntry", () => {
  it("adds a 100% Task completed entry when the last value is lower", () => {
    const task = makeTask({
      progress: 60,
      progressLog: [{ value: 60, at: now - 10, note: "almost" }],
    });

    const completed = completionEntry(task, now);

    expect(completed.progress).toBe(100);
    expect(completed.completedAt).toBe(now);
    expect(completed.progressLog).toEqual([
      { value: 60, at: now - 10, note: "almost" },
      { value: 100, at: now, note: "Task completed" },
    ]);
  });

  it("fills in a missing note when the last entry is already 100", () => {
    const task = makeTask({
      progress: 100,
      progressLog: [{ value: 100, at: now - 10, note: "" }],
    });

    const completed = completionEntry(task, now);

    expect(completed.progressLog).toHaveLength(1);
    expect(completed.progressLog[0].note).toBe("Task completed");
  });

  it("preserves an existing note on a 100% entry", () => {
    const task = makeTask({
      progress: 100,
      progressLog: [{ value: 100, at: now - 10, note: "All done" }],
    });

    const completed = completionEntry(task, now);

    expect(completed.progressLog[0].note).toBe("All done");
  });

  it("does not mutate the original task", () => {
    const task = makeTask({
      progress: 40,
      progressLog: [{ value: 40, at: now - 10, note: "step" }],
    });

    completionEntry(task, now);

    expect(task.progress).toBe(40);
    expect(task.progressLog).toHaveLength(1);
  });
});

describe("task filters and sorting", () => {
  const overdue = makeTask({
    id: "overdue",
    title: "Beta",
    createdAt: now - 2,
    deadline: now - 1000,
  });
  const active = makeTask({
    id: "active",
    title: "Alpha",
    createdAt: now - 1,
    deadline: now + 2000,
    progress: 40,
  });
  const notStarted = makeTask({
    id: "not-started",
    title: "Gamma",
    createdAt: now,
    deadline: now + 1000,
    progress: 0,
  });
  const tasks = [overdue, active, notStarted];

  it("filters pending, overdue, and completed tasks", () => {
    expect(isActive(active)).toBe(true);
    expect(isActive(notStarted)).toBe(false);
    expect(isOverdue(overdue, now)).toBe(true);
    expect(isPending(overdue, now)).toBe(false);
    expect(isPending(active, now)).toBe(true);
    expect(filterTasks(tasks, "pending", now).map((task) => task.id)).toEqual([
      "active",
      "not-started",
    ]);
    expect(filterTasks(tasks, "overdue", now).map((task) => task.id)).toEqual([
      "overdue",
    ]);
    expect(filterTasks(tasks, "completed", now)).toEqual([]);
    expect(filterTasks(tasks, "all", now)).toHaveLength(3);
  });

  it("sorts by deadline with undated tasks last", () => {
    const undated = makeTask({ id: "undated", title: "Delta" });
    const sorted = sortTasks([...tasks, undated], "deadline");

    expect(sorted.map((task) => task.id)).toEqual([
      "overdue",
      "not-started",
      "active",
      "undated",
    ]);
  });

  it("sorts by title and progress", () => {
    expect(sortTasks(tasks, "title").map((task) => task.title)).toEqual([
      "Alpha",
      "Beta",
      "Gamma",
    ]);
    expect(
      sortTasks(tasks, "progress-desc").map((task) => task.progress),
    ).toEqual([40, 0, 0]);
    expect(sortTasks(tasks, "progress-asc").map((task) => task.progress)).toEqual(
      [0, 0, 40],
    );
  });

  it("calculates summary stats", () => {
    const history: CompletedTask[] = [
      {
        ...makeTask({ id: "done-1" }),
        completedAt: now - 1000,
      },
      {
        ...makeTask({ id: "done-2" }),
        completedAt: now - 8 * 86_400_000,
      },
    ];

    expect(taskStats(tasks, history, now)).toEqual({
      pending: 2,
      active: 1,
      overdue: 1,
      completed: 2,
      completedThisWeek: 1,
    });
  });
});
