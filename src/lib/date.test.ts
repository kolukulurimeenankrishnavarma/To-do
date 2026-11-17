import { describe, expect, it } from "vitest";
import {
  combineDateAndTime,
  deadlineInfo,
  relativeTime,
} from "./date";

describe("combineDateAndTime", () => {
  it("combines valid date and time values", () => {
    const timestamp = combineDateAndTime("2027-01-15", "17:30");
    expect(timestamp).not.toBeNull();

    const date = new Date(timestamp as number);
    expect(date.getFullYear()).toBe(2027);
    expect(date.getMonth()).toBe(0);
    expect(date.getDate()).toBe(15);
    expect(date.getHours()).toBe(17);
    expect(date.getMinutes()).toBe(30);
  });

  it("rejects missing and impossible values", () => {
    expect(combineDateAndTime("", "17:30")).toBeNull();
    expect(combineDateAndTime("2027-01-15", "")).toBeNull();
    expect(combineDateAndTime("2027-02-30", "10:00")).toBeNull();
    expect(combineDateAndTime("nope", "10:00")).toBeNull();
  });
});

describe("deadlineInfo", () => {
  const now = new Date(2026, 4, 10, 12, 0, 0, 0).getTime();

  it("labels overdue deadlines", () => {
    const info = deadlineInfo(now - 60_000, null, now);
    expect(info.text).toMatch(/^Overdue/);
    expect(info.className).toBe("deadline--overdue");
  });

  it("labels due-today and due-tomorrow deadlines", () => {
    const today = new Date(2026, 4, 10, 17, 0, 0, 0).getTime();
    const tomorrow = new Date(2026, 4, 11, 9, 0, 0, 0).getTime();

    expect(deadlineInfo(today, null, now).text).toMatch(/^Due today/);
    expect(deadlineInfo(today, null, now).className).toBe("deadline--soon");
    expect(deadlineInfo(tomorrow, null, now).text).toMatch(/^Due tomorrow/);
  });

  it("labels completed tasks as on time or late", () => {
    const deadline = now + 60_000;
    expect(deadlineInfo(deadline, now, now).text).toMatch(/^On time/);
    expect(deadlineInfo(deadline, now, now).className).toBe("deadline--ontime");

    const pastDeadline = now - 60_000;
    expect(deadlineInfo(pastDeadline, now, now).text).toMatch(/^Late/);
    expect(deadlineInfo(pastDeadline, now, now).className).toBe(
      "deadline--late",
    );
  });
});

describe("relativeTime", () => {
  it("formats recent timestamps", () => {
    expect(relativeTime(1_700_000_000_000, 1_700_000_030_000)).toBe("just now");
    expect(relativeTime(1_700_000_000_000, 1_700_000_120_000)).toBe("2m ago");
    expect(relativeTime(1_700_000_000_000, 1_700_003_600_000)).toBe("1h ago");
    expect(relativeTime(1_700_000_000_000, 1_700_172_800_000)).toBe("2d ago");
  });
});
