import { describe, expect, it } from "vitest";
import type { AppState, CheckIn, CompletedTask, Task } from "../types";
import {
  addLimitNudge,
  buildCheckIn,
  currentCheckIn,
  DAY_MS,
  emptyInsights,
  localDayKey,
  normalizeInsights,
  personalBaseline,
  questionsForDay,
  recommendedDeadlineAdvice,
  repeatedTaskPatterns,
  sortBestFit,
  taskSuggestions,
} from "./insights";

function localNoon(dayOffset: number): number {
  return new Date(2026, 0, 1 + dayOffset, 12).getTime();
}

function task(id: string, title: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title,
    createdAt: 0,
    deadline: null,
    assigneeId: null,
    progress: 0,
    progressLog: [],
    ...overrides,
  };
}

function completed(
  id: string,
  title: string,
  createdAt: number,
  completedAt: number,
): CompletedTask {
  return {
    ...task(id, title, { createdAt }),
    progress: 100,
    completedAt,
  };
}

function baselineState(
  days: number,
  completionsPerDay: number,
  openPerDay = 0,
): AppState {
  const tasks: Task[] = [];
  const history: CompletedTask[] = [];

  for (let day = 0; day < days; day += 1) {
    const createdAt = localNoon(day) - 3 * 60 * 60 * 1000;
    const completedAt = localNoon(day) + 2 * 60 * 60 * 1000;
    for (let index = 0; index < completionsPerDay; index += 1) {
      history.push(completed(`h-${day}-${index}`, `Done ${index}`, createdAt, completedAt));
    }
    for (let index = 0; index < openPerDay; index += 1) {
      tasks.push(task(`t-${day}-${index}`, `Open ${index}`, { createdAt }));
    }
  }

  return { tasks, history };
}

describe("daily check-in rotation", () => {
  it("asks three unique questions and changes the whole set each day", () => {
    const first = questionsForDay("2026-01-01");
    const second = questionsForDay("2026-01-02");

    expect(first).toHaveLength(3);
    expect(new Set(first.map((item) => item.id)).size).toBe(3);
    expect(new Set(second.map((item) => item.id)).size).toBe(3);
    expect(second.map((item) => item.id).some((id) => first.some((q) => q.id === id))).toBe(
      false,
    );
    expect(questionsForDay("2026-01-01")).toEqual(first);
  });

  it("averages mood answers and clamps direct inputs", () => {
    const checkIn = buildCheckIn("2026-01-01", 9, 600, [
      { id: "a", prompt: "A", value: 5 },
      { id: "b", prompt: "B", value: 4 },
      { id: "c", prompt: "C", value: 3 },
    ]);

    expect(checkIn).toMatchObject({
      day: "2026-01-01",
      energy: 5,
      mood: 4,
      timeWindow: 480,
    });
    expect(checkIn.createdAt).toBeGreaterThan(0);
    expect(checkIn.answers).toHaveLength(3);
  });

  it("normalizes stored check-ins and ignores malformed answers", () => {
    const checkIn = buildCheckIn("2026-01-01", 3, 45, [
      { id: "a", prompt: "A", value: 4 },
      { id: "b", prompt: "B", value: 2 },
    ]);
    const restored = normalizeInsights({
      version: 1,
      checkIn,
      lastPromptDay: "2026-01-01",
      updatedAt: 12,
    });

    expect(restored.checkIn).toEqual(checkIn);
    expect(restored.lastPromptDay).toBe("2026-01-01");
    expect(normalizeInsights({ checkIn: { day: "nope" } })).toEqual(emptyInsights());
    expect(
      normalizeInsights({
        checkIn: {
          ...checkIn,
          answers: [checkIn.answers[0], checkIn.answers[0]],
        },
      }).checkIn?.answers,
    ).toHaveLength(1);
  });

  it("only treats a same-day check-in as active", () => {
    const checkIn: CheckIn = buildCheckIn("2026-01-01", 4, 60, [
      { id: "a", prompt: "A", value: 4 },
    ]);
    expect(currentCheckIn({ ...emptyInsights(), checkIn }, "2026-01-01")).toBe(checkIn);
    expect(currentCheckIn({ ...emptyInsights(), checkIn }, "2026-01-02")).toBeNull();
    expect(localDayKey(localNoon(0))).toBe("2026-01-01");
  });
});

describe("personal baseline and add nudge", () => {
  it("uses the first seven active days and computes the daily streak", () => {
    const baseline = personalBaseline(baselineState(10, 6, 4));

    expect(baseline.ready).toBe(true);
    expect(baseline.dayCount).toBe(10);
    expect(baseline.dailyStreak).toBe(6);
    expect(baseline.averageAdded).toBe(10);
  });

  it("stays inactive until seven active days exist", () => {
    const baseline = personalBaseline(baselineState(6, 6, 4));
    expect(baseline.ready).toBe(false);
    expect(baseline.dailyStreak).toBe(0);
    expect(addLimitNudge(baselineState(6, 6, 4), baseline, localNoon(8))).toBeNull();
  });

  it("nudges at the streak without blocking more tasks", () => {
    const state = baselineState(7, 6);
    const baseline = personalBaseline(state);
    const now = localNoon(8);
    expect(addLimitNudge(state, baseline, now)).toBeNull();

    const atStreak: AppState = {
      ...state,
      tasks: Array.from({ length: 6 }, (_, index) =>
        task(`new-${index}`, `New ${index}`, { createdAt: now }),
      ),
    };
    const nudge = addLimitNudge(atStreak, baseline, now);
    expect(nudge).toContain("6 tasks today");
    expect(nudge).toContain("streak is about 6");
  });
});

describe("repeated task deadlines", () => {
  it("recommends median duration plus a one-day buffer", () => {
    const state: AppState = {
      tasks: [],
      history: [
        completed("a", "Review report #1", localNoon(0), localNoon(0) + DAY_MS),
        completed("b", "Review report #2", localNoon(3), localNoon(3) + 3 * DAY_MS),
        completed("c", "Review report #3", localNoon(8), localNoon(8) + 5 * DAY_MS),
      ],
    };

    const patterns = repeatedTaskPatterns(state);
    expect(patterns).toHaveLength(1);
    expect(patterns[0]).toMatchObject({ count: 3, medianDays: 3, recommendedDays: 4 });

    const advice = recommendedDeadlineAdvice("Review report #4", patterns);
    expect(advice).toContain("3 similar tasks");
    expect(advice).toContain("4 days");
    expect(recommendedDeadlineAdvice("Write launch plan", patterns)).toBeNull();
  });
});

describe("task suggestions", () => {
  const light = task("light", "review notes", { progress: 80 });
  const complex = task("complex", "refactor api", { progress: 10 });
  const low: CheckIn = buildCheckIn("2026-01-01", 1, 20, [
    { id: "a", prompt: "A", value: 2 },
  ]);
  const high: CheckIn = buildCheckIn("2026-01-01", 5, 120, [
    { id: "a", prompt: "A", value: 5 },
  ]);

  it("fits quick wins when energy and time are low", () => {
    expect(sortBestFit([complex, light], low, Date.now())[0].id).toBe("light");
    const suggestions = taskSuggestions([complex, light], low, Date.now());
    expect(suggestions.fit[0].taskId).toBe("light");
    expect(suggestions.boost.some((item) => item.taskId === "light")).toBe(true);
  });

  it("fits deeper work when energy and time are high", () => {
    expect(sortBestFit([light, complex], high, Date.now())[0].id).toBe("complex");
    expect(taskSuggestions([], null, Date.now())).toEqual({ fit: [], boost: [] });
  });
});
