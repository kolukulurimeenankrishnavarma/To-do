import { describe, expect, it } from "vitest";
import {
  DAY_MS,
  deadlineAdvice,
  detectRecurringRules,
  normalizeInsights,
  sortBestFit,
} from "./insights";
import type {
  AppState,
  CheckIn,
  CompletedTask,
  Task,
} from "../types";

const NOW = Date.UTC(2025, 5, 1);

function task(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: id,
    createdAt: NOW - 10 * DAY_MS,
    deadline: null,
    assigneeId: null,
    progress: 0,
    progressLog: [],
    ...overrides,
  };
}

function completed(id: string, title: string, completedAt: number): CompletedTask {
  return {
    ...task(id, { title, createdAt: completedAt - 9 * DAY_MS }),
    progress: 100,
    completedAt,
  };
}

function checkIn(overrides: Partial<CheckIn> = {}): CheckIn {
  return {
    energy: 3,
    mood: 3,
    focus: 3,
    timeWindow: 30,
    goal: "",
    blockers: "",
    createdAt: NOW,
    ...overrides,
  };
}

function state(tasks: Task[], history: CompletedTask[] = []): AppState {
  return { tasks, history };
}

describe("normalizeInsights", () => {
  it("clamps check-in values and discards invalid rules", () => {
    const result = normalizeInsights({
      checkIn: {
        energy: 99,
        mood: -4,
        focus: 3,
        timeWindow: 10_000,
        goal: "  ship  the  api  ",
        blockers: "",
        createdAt: NOW,
      },
      recurringRules: [
        { title: "Review API Gateway", cadence: "weekly", lastCreatedAt: 1 },
        { title: "", cadence: "weekly", lastCreatedAt: 1 },
      ],
    });

    expect(result.checkIn?.energy).toBe(5);
    expect(result.checkIn?.mood).toBe(1);
    expect(result.checkIn?.timeWindow).toBe(480);
    expect(result.checkIn?.goal).toBe("ship the api");
    expect(result.recurringRules).toHaveLength(1);
    expect(result.recurringRules[0].cadence).toBe("weekly");
  });
});

describe("best-fit ordering", () => {
  const quickWin = task("quick", {
    title: "Review Dashboard UI #12",
    progress: 75,
    createdAt: NOW - 3 * DAY_MS,
  });
  const deepWork = task("deep", {
    title: "Refactor API Gateway #31",
    progress: 0,
    createdAt: NOW - 2 * DAY_MS,
  });

  it("favors quick wins when energy and time are low", () => {
    const ordered = sortBestFit([deepWork, quickWin], {
      checkIn: checkIn({ energy: 1, focus: 2, timeWindow: 15 }),
      history: [],
      now: NOW,
    });
    expect(ordered.map((item) => item.id)).toEqual(["quick", "deep"]);
  });

  it("favors deep work when capacity is high", () => {
    const ordered = sortBestFit([quickWin, deepWork], {
      checkIn: checkIn({ energy: 5, focus: 5, timeWindow: 120 }),
      history: [],
      now: NOW,
    });
    expect(ordered.map((item) => item.id)).toEqual(["deep", "quick"]);
  });

  it("keeps deadline-first behavior for overdue work outside the helper", () => {
    const overdue = task("old", { deadline: NOW - 5 * DAY_MS });
    const ordered = sortBestFit([quickWin, overdue], {
      checkIn: checkIn({ energy: 5, focus: 5, timeWindow: 120 }),
      history: [],
      now: NOW,
    });
    expect(ordered.map((item) => item.id)).toEqual(["old", "quick"]);
  });
});

describe("deadlineAdvice", () => {
  it("warns when a deadline is much tighter than similar history", () => {
    const history = [
      completed("h1", "Review API Gateway #1", NOW - 20 * DAY_MS),
      completed("h2", "Review API Gateway #2", NOW - 11 * DAY_MS),
    ];
    const advice = deadlineAdvice(
      "Review API Gateway #3",
      NOW + 2 * DAY_MS,
      state([], history),
      NOW,
    );
    expect(advice).toContain("tight");
  });

  it("returns null for a comfortable deadline", () => {
    expect(
      deadlineAdvice(
        "Review Dashboard UI #4",
        NOW + 20 * DAY_MS,
        state([], []),
        NOW,
      ),
    ).toBeNull();
  });
});

describe("detectRecurringRules", () => {
  it("finds a weekly cadence and leaves recently completed work alone", () => {
    const history = [
      completed("h1", "Audit Security Patch #1", NOW - 42 * DAY_MS),
      completed("h2", "Audit Security Patch #2", NOW - 35 * DAY_MS),
      completed("h3", "Audit Security Patch #3", NOW - 28 * DAY_MS),
    ];
    const rules = detectRecurringRules(state([], history), [], null, NOW);
    expect(rules).toHaveLength(1);
    expect(rules[0].cadence).toBe("weekly");
    expect(rules[0].lastCreatedAt).toBe(NOW - 28 * DAY_MS);
    expect(rules[0].targetTeamId).toBeNull();

    const recent = [
      completed("h4", "Deploy Auth Service #1", NOW - 9 * DAY_MS),
      completed("h5", "Deploy Auth Service #2", NOW - 2 * DAY_MS),
    ];
    expect(
      detectRecurringRules(state([], recent), [], "team-1", NOW),
    ).toHaveLength(0);
  });
});
