import {
  MAX_NOTE_LENGTH,
  MAX_PROGRESS_LOG,
  PROGRESS_STEP,
} from "./validation.mjs";

function isRecord(value) {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

export function clampProgress(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  const stepped = Math.round(number / PROGRESS_STEP) * PROGRESS_STEP;
  return Math.min(100, Math.max(0, stepped));
}

export function normalizeNote(note) {
  return String(note ?? "").trim().slice(0, MAX_NOTE_LENGTH);
}

function normalizeProgressLog(value) {
  if (!Array.isArray(value)) return [];

  return value
    .filter(
      (entry) =>
        isRecord(entry) &&
        isFiniteNumber(entry.value) &&
        isFiniteNumber(entry.at),
    )
    .map((entry) => ({
      value: clampProgress(entry.value),
      at: entry.at,
      note: normalizeNote(typeof entry.note === "string" ? entry.note : ""),
      by:
        typeof entry.by === "string" && entry.by.length > 0 ? entry.by : null,
    }))
    .sort((a, b) => a.at - b.at)
    .slice(-MAX_PROGRESS_LOG);
}

function normalizeTask(value, isCompleted) {
  if (!isRecord(value)) return null;

  const { id, title, createdAt } = value;
  if (
    typeof id !== "string" ||
    id.length === 0 ||
    typeof title !== "string" ||
    title.length === 0 ||
    !isFiniteNumber(createdAt)
  ) {
    return null;
  }

  const deadline = isFiniteNumber(value.deadline) ? value.deadline : null;
  const assigneeId =
    typeof value.assigneeId === "string" && value.assigneeId.length > 0
      ? value.assigneeId
      : null;
  const rawProgress = isFiniteNumber(value.progress)
    ? value.progress
    : isCompleted
      ? 100
      : 0;

  const task = {
    id,
    title: title.slice(0, 200),
    createdAt,
    deadline,
    assigneeId,
    progress: clampProgress(rawProgress),
    progressLog: normalizeProgressLog(value.progressLog),
  };

  if (!isCompleted) return task;
  if (!isFiniteNumber(value.completedAt)) return null;
  return { ...task, completedAt: value.completedAt };
}

export function emptyState() {
  return { tasks: [], history: [] };
}

export function normalizeState(value) {
  if (!isRecord(value)) return emptyState();

  const tasks = Array.isArray(value.tasks)
    ? value.tasks
        .map((task) => normalizeTask(task, false))
        .filter((task) => task !== null)
    : [];

  const history = Array.isArray(value.history)
    ? value.history
        .map((item) => normalizeTask(item, true))
        .filter((item) => item !== null)
    : [];

  return { tasks, history };
}
