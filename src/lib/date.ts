import { DAY_MS } from "./constants";
import type { DeadlineInfo } from "../types";

export function relativeTime(timestamp: number, now = Date.now()): string {
  const diff = now - timestamp;
  const minute = 60_000;
  const hour = 3_600_000;

  if (diff < minute) return "just now";
  if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
  if (diff < DAY_MS) return `${Math.floor(diff / hour)}h ago`;
  if (diff < 7 * DAY_MS) return `${Math.floor(diff / DAY_MS)}d ago`;

  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year:
      new Date(timestamp).getFullYear() === new Date(now).getFullYear()
        ? undefined
        : "numeric",
  });
}

export function fullTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function deadlineInfo(
  deadline: number,
  completedAt: number | null = null,
  now = Date.now(),
): DeadlineInfo {
  const due = new Date(deadline);
  const current = new Date(now);
  const time = due.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  const includeYear = due.getFullYear() !== current.getFullYear();
  const short =
    due.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: includeYear ? "numeric" : undefined,
    }) + `, ${time}`;

  if (completedAt !== null) {
    return completedAt <= deadline
      ? { text: `On time · ${short}`, className: "deadline--ontime" }
      : { text: `Late · ${short}`, className: "deadline--late" };
  }

  if (deadline < now) {
    return { text: `Overdue · ${short}`, className: "deadline--overdue" };
  }

  const days = Math.round((startOfDay(due) - startOfDay(current)) / DAY_MS);
  if (days === 0) {
    return { text: `Due today, ${time}`, className: "deadline--soon" };
  }
  if (days === 1) {
    return { text: `Due tomorrow, ${time}`, className: "deadline--soon" };
  }
  return { text: `Due ${short}`, className: "deadline--due" };
}

export function progressSummary(
  count: number,
  timestamp: number,
  now = Date.now(),
): string {
  return `Updated ${relativeTime(timestamp, now)} · ${count} update${
    count === 1 ? "" : "s"
  }`;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function dateInputValue(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(
    date.getDate(),
  )}`;
}

export function timeInputValue(timestamp: number): string {
  const date = new Date(timestamp);
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function combineDateAndTime(
  dateValue: string,
  timeValue: string,
): number | null {
  if (!dateValue || !timeValue) return null;

  const dateParts = dateValue.split("-").map(Number);
  const timeParts = timeValue.split(":").map(Number);
  if (dateParts.length !== 3 || timeParts.length < 2) return null;

  const [year, month, day] = dateParts;
  const [hours, minutes] = timeParts;
  if (![year, month, day, hours, minutes].every(Number.isFinite)) return null;

  const date = new Date(year, month - 1, day, hours, minutes, 0, 0);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hours ||
    date.getMinutes() !== minutes
  ) {
    return null;
  }

  return date.getTime();
}

export function defaultDeadlineDate(): Date {
  const date = new Date();
  date.setSeconds(0, 0);
  date.setMinutes(Math.ceil((date.getMinutes() + 1) / 15) * 15);
  return date;
}

export function presetDeadline(daysAhead: number): number {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  date.setHours(17, 0, 0, 0);
  return date.getTime() <= Date.now() ? defaultDeadlineDate().getTime() : date.getTime();
}

export function friendlyDeadline(timestamp: number, now = Date.now()): string {
  const due = new Date(timestamp);
  const current = new Date(now);
  const days = Math.round((startOfDay(due) - startOfDay(current)) / DAY_MS);
  const time = due.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  if (days === 0) return `Today, ${time}`;
  if (days === 1) return `Tomorrow, ${time}`;

  const includeYear = due.getFullYear() !== current.getFullYear();
  return `${due.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: includeYear ? "numeric" : undefined,
  })}, ${time}`;
}

export function fullDeadlineLabel(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatToday(now = new Date()): string {
  return now.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}
