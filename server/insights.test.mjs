import { describe, expect, it } from "vitest";
import {
  DAY_MS,
  classifyRulesForRun,
  detectRecurringRules,
  emptyInsights,
  normalizeInsights,
  titleKey,
} from "./insights.mjs";

const NOW = Date.UTC(2025, 5, 1);

describe("titleKey", () => {
  it("ignores generated ids and punctuation", () => {
    expect(titleKey("Review API Gateway #42")).toBe("review api gateway");
    expect(titleKey("review api gateway")).toBe("review api gateway");
  });
});

describe("normalizeInsights", () => {
  it("drops unknown teams and duplicate rules while preserving check-ins", () => {
    const normalized = normalizeInsights({
      checkIn: {
        energy: 2,
        mood: 5,
        focus: 4,
        timeWindow: 45,
        goal: "ship it",
        blockers: "",
        createdAt: NOW,
      },
      recurringRules: [
        {
          title: "Review API Gateway",
          cadence: "weekly",
          lastCreatedAt: NOW - 7 * DAY_MS,
          targetTeamId: "team-1",
        },
        {
          title: "Review API Gateway",
          cadence: "monthly",
          lastCreatedAt: NOW - 30 * DAY_MS,
          targetTeamId: "team-1",
        },
        { title: "", lastCreatedAt: 1 },
      ],
    });

    expect(normalized.checkIn?.energy).toBe(2);
    expect(normalized.recurringRules).toHaveLength(1);
    expect(normalized.recurringRules[0].cadence).toBe("weekly");
    expect(normalizeInsights(null)).toEqual(emptyInsights());
  });
});

describe("detectRecurringRules", () => {
  it("requires consistent gaps and seeds the last completion time", () => {
    const history = [
      {
        id: "h1",
        title: "Audit Billing Pipeline #1",
        completedAt: NOW - 49 * DAY_MS,
      },
      {
        id: "h2",
        title: "Audit Billing Pipeline #2",
        completedAt: NOW - 42 * DAY_MS,
      },
      {
        id: "h3",
        title: "Audit Billing Pipeline #3",
        completedAt: NOW - 35 * DAY_MS,
      },
    ];

    const rules = detectRecurringRules({ history }, [], NOW);
    expect(rules).toHaveLength(1);
    expect(rules[0].cadence).toBe("weekly");
    expect(rules[0].lastCreatedAt).toBe(NOW - 35 * DAY_MS);
    expect(rules[0].sourceTaskIds).toEqual(["h1", "h2", "h3"]);
  });
});

describe("classifyRulesForRun", () => {
  it("disables rules whose team is gone or no longer includes the user", () => {
    const insights = normalizeInsights({
      recurringRules: [
        {
          title: "Private review",
          cadence: "weekly",
          lastCreatedAt: NOW - 14 * DAY_MS,
        },
        {
          title: "Team review",
          cadence: "weekly",
          lastCreatedAt: NOW - 14 * DAY_MS,
          targetTeamId: "team-1",
        },
        {
          title: "Removed team review",
          cadence: "weekly",
          lastCreatedAt: NOW - 14 * DAY_MS,
          targetTeamId: "team-2",
        },
      ],
    });
    const db = {
      teams: [
        {
          id: "team-1",
          members: [{ userId: "other", role: "host", joinedAt: 0 }],
          state: { tasks: [], history: [] },
        },
      ],
    };

    const { ready, disabled } = classifyRulesForRun(db, "user-1", insights);
    expect(ready).toHaveLength(1);
    expect(ready[0].targetTeamId).toBeNull();
    expect(disabled).toHaveLength(2);
  });
});
