import { MAX_NOTE_LENGTH, MAX_PROGRESS_LOG, MAX_TITLE_LENGTH } from "./constants";
import type {
  CompletedTask,
  ProgressEntry,
  Task,
  TaskFilter,
  TaskSort,
} from "../types";

export function completionEntry(task: Task, completedAt: number): CompletedTask {
  const progressLog = task.progressLog.map((entry) => ({ ...entry }));
  const last = progressLog[progressLog.length - 1];

  if (last && last.value === 100) {
    if (!last.note) last.note = "Task completed";
  } else {
    const entry: ProgressEntry = {
      value: 100,
      at: completedAt,
      note: "Task completed",
    };
    progressLog.push(entry);
    if (progressLog.length > MAX_PROGRESS_LOG) {
      progressLog.splice(0, progressLog.length - MAX_PROGRESS_LOG);
    }
  }

  return {
    ...task,
    progress: 100,
    progressLog,
    completedAt,
  };
}

export function isOverdue(task: Task, now = Date.now()): boolean {
  return task.deadline !== null && task.deadline < now;
}

export function isActive(task: Task): boolean {
  return task.progress > 0 && task.progress < 100;
}

/**
 * Pending means still open and not past its target time. Tasks without a
 * deadline stay pending until they are completed.
 */
export function isPending(task: Task, now = Date.now()): boolean {
  return !isOverdue(task, now);
}

export function filterTasks(
  tasks: Task[],
  filter: TaskFilter,
  now = Date.now(),
): Task[] {
  if (filter === "pending") return tasks.filter((task) => isPending(task, now));
  if (filter === "overdue") return tasks.filter((task) => isOverdue(task, now));
  if (filter === "completed") return [];
  return tasks;
}

export function sortTasks(tasks: Task[], sort: TaskSort): Task[] {
  const sorted = [...tasks];

  switch (sort) {
    case "deadline":
      return sorted.sort((a, b) => {
        if (a.deadline === null && b.deadline === null) {
          return b.createdAt - a.createdAt;
        }
        if (a.deadline === null) return 1;
        if (b.deadline === null) return -1;
        return a.deadline - b.deadline;
      });
    case "progress-desc":
      return sorted.sort(
        (a, b) => b.progress - a.progress || b.createdAt - a.createdAt,
      );
    case "progress-asc":
      return sorted.sort(
        (a, b) => a.progress - b.progress || b.createdAt - a.createdAt,
      );
    case "title":
      return sorted.sort((a, b) =>
        a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
      );
    case "newest":
    default:
      return sorted.sort((a, b) => b.createdAt - a.createdAt);
  }
}

export type TaskStats = {
  pending: number;
  active: number;
  overdue: number;
  completed: number;
  completedThisWeek: number;
};

export function taskStats(
  tasks: Task[],
  history: CompletedTask[],
  now = Date.now(),
): TaskStats {
  const weekAgo = now - 7 * 86_400_000;

  return {
    pending: tasks.filter((task) => isPending(task, now)).length,
    active: tasks.filter(isActive).length,
    overdue: tasks.filter((task) => isOverdue(task, now)).length,
    completed: history.length,
    completedThisWeek: history.filter((item) => item.completedAt >= weekAgo)
      .length,
  };
}

export function detailValue(entry: ProgressEntry): string {
  return `${entry.value}%${entry.note ? ` — ${entry.note}` : ""}`;
}

export function sanitizeTitle(title: string): string {
  return title.replace(/\s+/g, " ").trim().slice(0, MAX_TITLE_LENGTH);
}

export function sanitizeProgressNote(note: string): string {
  return note.trim().slice(0, MAX_NOTE_LENGTH);
}
