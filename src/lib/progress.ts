import {
  MAX_NOTE_LENGTH,
  MAX_PROGRESS_LOG,
  PROGRESS_STEP,
} from "./constants";
import type { ProgressEntry, Task } from "../types";

export function clampProgress(value: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  const stepped = Math.round(number / PROGRESS_STEP) * PROGRESS_STEP;
  return Math.min(100, Math.max(0, stepped));
}

export function normalizeNote(note: string): string {
  return note.trim().slice(0, MAX_NOTE_LENGTH);
}

export function appendProgressEntry<T extends Task>(
  task: T,
  value: number,
  at: number,
  note = "",
  by: string | null = null,
): T {
  const entry: ProgressEntry = {
    value: clampProgress(value),
    at,
    note: normalizeNote(note),
    by,
  };
  const progressLog = [...task.progressLog, entry].slice(-MAX_PROGRESS_LOG);

  return {
    ...task,
    progress: entry.value,
    progressLog,
  };
}
