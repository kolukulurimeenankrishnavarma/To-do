import { describe, expect, it } from "vitest";
import { emptyInsights, normalizeInsights } from "./insights.mjs";

describe("private insight storage normalization", () => {
  it("starts with an empty check-in", () => {
    expect(emptyInsights()).toEqual({
      version: 1,
      checkIn: null,
      lastPromptDay: null,
      updatedAt: 0,
    });
  });

  it("clamps values and keeps only unique, bounded mood answers", () => {
    const normalized = normalizeInsights({
      version: 99,
      updatedAt: 42,
      lastPromptDay: "2026-01-01",
      checkIn: {
        day: "2026-01-01",
        energy: 99,
        mood: -2,
        timeWindow: 9000,
        createdAt: 12,
        answers: [
          { id: "a", prompt: "A", value: 8 },
          { id: "a", prompt: "Duplicate", value: 2 },
          { id: "b", prompt: "B", value: 1 },
        ],
      },
    });

    expect(normalized.version).toBe(1);
    expect(normalized.updatedAt).toBe(42);
    expect(normalized.checkIn).toMatchObject({
      energy: 5,
      mood: 1,
      timeWindow: 480,
      answers: [
        { id: "a", value: 5 },
        { id: "b", value: 1 },
      ],
    });
  });

  it("drops malformed check-ins instead of trusting crafted data", () => {
    expect(normalizeInsights({ checkIn: { day: "yesterday" } }).checkIn).toBeNull();
    expect(
      normalizeInsights({
        checkIn: { day: "2026-01-01", createdAt: 1, answers: "no" },
      }).checkIn,
    ).toBeNull();
    expect(normalizeInsights(null)).toEqual(emptyInsights());
  });
});
