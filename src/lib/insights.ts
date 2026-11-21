import type {
  AppState,
  CheckIn,
  Insights,
  MoodAnswer,
  Task,
} from "../types";

export const INSIGHTS_VERSION = 1;
export const DAY_MS = 86_400_000;
export const BASELINE_ACTIVE_DAYS = 7;
export const MOOD_QUESTIONS_PER_DAY = 3;

/**
 * A bank of distinct mood prompts. Three are chosen per day and the starting
 * point advances by three each day, so the same question is never asked twice
 * within a check-in and consecutive days use completely different questions.
 */
export const MOOD_QUESTIONS: { id: string; prompt: string }[] = [
  { id: "clarity", prompt: "I feel clear-headed about my work." },
  { id: "motivation", prompt: "I feel motivated to start something new." },
  { id: "patience", prompt: "Small delays are easy for me to handle." },
  { id: "confidence", prompt: "I feel confident about today's tasks." },
  { id: "detail", prompt: "I have patience for detailed work." },
  { id: "company", prompt: "I feel up for working with other people." },
  { id: "focus", prompt: "I can focus without switching tasks." },
  { id: "optimism", prompt: "I feel optimistic about finishing what I start." },
  { id: "revisit", prompt: "I'm comfortable revisiting unfinished work." },
  { id: "deadlines", prompt: "I feel calm about my deadlines." },
  { id: "decisions", prompt: "I feel ready to make decisions quickly." },
  { id: "progress", prompt: "I feel satisfied with the progress I'm making." },
];

const COMPLEX_VERBS = [
  "refactor",
  "migrate",
  "automate",
  "implement",
  "deploy",
  "optimize",
];
const LIGHT_VERBS = ["review", "audit", "analyze", "design"];
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function cleanText(value: unknown, max: number): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function localDayKey(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dayNumber(day: string): number {
  if (!DAY_PATTERN.test(day)) return 0;
  const [year, month, date] = day.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, date) / DAY_MS);
}

/** Three unique prompts, advanced deterministically by calendar day. */
export function questionsForDay(day: string): { id: string; prompt: string }[] {
  const start =
    (((dayNumber(day) * MOOD_QUESTIONS_PER_DAY) % MOOD_QUESTIONS.length) +
      MOOD_QUESTIONS.length) %
    MOOD_QUESTIONS.length;
  return Array.from(
    { length: MOOD_QUESTIONS_PER_DAY },
    (_, index) => MOOD_QUESTIONS[(start + index) % MOOD_QUESTIONS.length],
  );
}

export function emptyInsights(): Insights {
  return {
    version: INSIGHTS_VERSION,
    checkIn: null,
    lastPromptDay: null,
    updatedAt: 0,
  };
}

export function normalizeInsights(value: unknown): Insights {
  if (!value || typeof value !== "object") return emptyInsights();
  const input = value as Record<string, unknown>;

  let checkIn: CheckIn | null = null;
  if (input.checkIn && typeof input.checkIn === "object") {
    const raw = input.checkIn as Record<string, unknown>;
    const day = typeof raw.day === "string" && DAY_PATTERN.test(raw.day) ? raw.day : "";
    const createdAt = finite(raw.createdAt, 0);
    const answers: MoodAnswer[] = [];
    const seen = new Set<string>();

    if (Array.isArray(raw.answers)) {
      for (const entry of raw.answers) {
        if (!entry || typeof entry !== "object") continue;
        const answer = entry as Record<string, unknown>;
        const id = cleanText(answer.id, 40);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        answers.push({
          id,
          prompt: cleanText(answer.prompt, 120),
          value: clamp(Math.round(finite(answer.value, 3)), 1, 5),
        });
      }
    }

    if (day && createdAt > 0 && answers.length > 0) {
      checkIn = {
        day,
        energy: clamp(Math.round(finite(raw.energy, 3)), 1, 5),
        mood: clamp(finite(raw.mood, 3), 1, 5),
        timeWindow: clamp(Math.round(finite(raw.timeWindow, 30)), 10, 480),
        answers: answers.slice(0, MOOD_QUESTIONS_PER_DAY),
        createdAt,
      };
    }
  }

  const lastPromptDay =
    typeof input.lastPromptDay === "string" && DAY_PATTERN.test(input.lastPromptDay)
      ? input.lastPromptDay
      : null;

  return {
    version: INSIGHTS_VERSION,
    checkIn,
    lastPromptDay,
    updatedAt: finite(input.updatedAt, 0),
  };
}

export function buildCheckIn(
  day: string,
  energy: number,
  timeWindow: number,
  answers: MoodAnswer[],
): CheckIn {
  const values = answers.map((answer) =>
    clamp(Math.round(finite(answer.value, 3)), 1, 5),
  );
  const average = values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 3;

  return {
    day,
    energy: clamp(Math.round(energy), 1, 5),
    mood: Math.round(average * 10) / 10,
    timeWindow: clamp(Math.round(timeWindow), 10, 480),
    answers: answers.slice(0, MOOD_QUESTIONS_PER_DAY).map((answer) => ({
      id: answer.id,
      prompt: answer.prompt,
      value: clamp(Math.round(answer.value), 1, 5),
    })),
    createdAt: Date.now(),
  };
}

/** Recommendations only use a check-in from the same calendar day. */
export function currentCheckIn(insights: Insights, day: string): CheckIn | null {
  return insights.checkIn?.day === day ? insights.checkIn : null;
}

/** Remove issue-like suffixes such as #7, #7-2, or #7.3 before comparing. */
function stripTaskSuffix(value: string): string {
  return value.replace(/\s*#\d+(?:[.-]\d+)*\s*/g, " ");
}

export function titleKey(title: string): string {
  return cleanText(stripTaskSuffix(title), 200)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function words(value: string): Set<string> {
  return new Set(
    titleKey(value)
      .split(" ")
      .filter((word) => word.length > 3),
  );
}

function overlapCount(a: Set<string>, b: Set<string>): number {
  let count = 0;
  for (const word of a) if (b.has(word)) count += 1;
  return count;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

export type DayActivity = {
  day: string;
  added: number;
  completed: number;
};

export type PersonalBaseline = {
  activeDays: DayActivity[];
  dayCount: number;
  ready: boolean;
  /** Average completed tasks per active day in the first seven active days. */
  dailyStreak: number;
  averageAdded: number;
};

/** Counts the first seven active private days as the observation window. */
export function personalBaseline(state: AppState): PersonalBaseline {
  const byDay = new Map<string, DayActivity>();

  function bucket(timestamp: number): DayActivity | null {
    if (!Number.isFinite(timestamp)) return null;
    const day = localDayKey(timestamp);
    let entry = byDay.get(day);
    if (!entry) {
      entry = { day, added: 0, completed: 0 };
      byDay.set(day, entry);
    }
    return entry;
  }

  for (const task of state.tasks) {
    const day = bucket(task.createdAt);
    if (day) day.added += 1;
  }
  for (const item of state.history) {
    const created = bucket(item.createdAt);
    if (created) created.added += 1;
    const completed = bucket(item.completedAt);
    if (completed) completed.completed += 1;
  }

  const activeDays = [...byDay.values()].sort((a, b) =>
    a.day.localeCompare(b.day),
  );
  const window = activeDays.slice(0, BASELINE_ACTIVE_DAYS);
  const completed = window.reduce((sum, day) => sum + day.completed, 0);
  const added = window.reduce((sum, day) => sum + day.added, 0);
  const ready = activeDays.length >= BASELINE_ACTIVE_DAYS && completed > 0;

  return {
    activeDays,
    dayCount: activeDays.length,
    ready,
    dailyStreak: ready ? Math.max(1, Math.round(completed / window.length)) : 0,
    averageAdded: ready ? Math.max(1, Math.round(added / window.length)) : 0,
  };
}

export function addedOnDay(state: AppState, day: string): number {
  let count = 0;
  for (const task of state.tasks) {
    if (localDayKey(task.createdAt) === day) count += 1;
  }
  for (const item of state.history) {
    if (localDayKey(item.createdAt) === day) count += 1;
  }
  return count;
}

export function addLimitNudge(
  state: AppState,
  baseline: PersonalBaseline,
  now: number,
): string | null {
  if (!baseline.ready) return null;
  const added = addedOnDay(state, localDayKey(now));
  if (added < baseline.dailyStreak) return null;

  return `You've added ${added} tasks today. Your 7-day streak is about ${baseline.dailyStreak} finished tasks a day — consider finishing these before adding more.`;
}

export type RepeatedTaskPattern = {
  key: string;
  title: string;
  count: number;
  medianDays: number;
  recommendedDays: number;
};

/** Same normalized titles completed repeatedly in the private history. */
export function repeatedTaskPatterns(state: AppState): RepeatedTaskPattern[] {
  const groups = new Map<string, typeof state.history>();

  for (const item of state.history) {
    const key = titleKey(item.title);
    if (!key) continue;
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }

  const patterns: RepeatedTaskPattern[] = [];

  for (const [key, items] of groups) {
    if (items.length < 2) continue;
    const durations = items
      .map((item) => (item.completedAt - item.createdAt) / DAY_MS)
      .filter((days) => Number.isFinite(days) && days > 0 && days < 180);
    if (durations.length === 0) continue;

    const medianDays = Math.round(median(durations) * 10) / 10;
    const last = items[items.length - 1];
    patterns.push({
      key,
      title: cleanText(stripTaskSuffix(last.title), 200) || key,
      count: items.length,
      medianDays,
      recommendedDays: Math.max(1, Math.ceil(medianDays) + 1),
    });
  }

  return patterns.sort((a, b) => b.count - a.count).slice(0, 8);
}

export function patternMatchesTitle(
  pattern: RepeatedTaskPattern,
  title: string,
): boolean {
  const key = titleKey(title);
  if (!key) return false;
  if (key === pattern.key) return true;
  return overlapCount(new Set(key.split(" ")), words(pattern.title)) >= 2;
}

export function recommendedDeadlineAdvice(
  title: string,
  patterns: RepeatedTaskPattern[],
): string | null {
  if (!title.trim()) return null;
  const match = patterns.find((pattern) => patternMatchesTitle(pattern, title));
  if (!match) return null;

  return `Based on your ${match.count} similar tasks, a deadline of about ${match.recommendedDays} day${
    match.recommendedDays === 1 ? "" : "s"
  } usually works.`;
}

function complexity(title: string): number {
  const key = titleKey(title);
  if (COMPLEX_VERBS.some((verb) => key.startsWith(verb))) return 3;
  if (LIGHT_VERBS.some((verb) => key.startsWith(verb))) return 1;
  return 2;
}

function effortMinutes(task: Task): number {
  const remaining = 1 - clamp(task.progress, 0, 100) / 100;
  return Math.max(5, Math.round((complexity(task.title) * 15 + 10) * remaining));
}

function urgency(task: Task, now: number): number {
  if (task.deadline === null) return 0;
  const days = (task.deadline - now) / DAY_MS;
  if (days < 0) return 20;
  if (days < 1) return 14;
  if (days < 3) return 8;
  if (days < 7) return 4;
  return 0;
}

export type TaskSuggestion = {
  taskId: string;
  title: string;
  reason: string;
};

/** Higher scores are better fits for the current check-in. */
export function bestFitScore(task: Task, checkIn: CheckIn, now: number): number {
  const low = checkIn.energy <= 2 || checkIn.mood <= 2 || checkIn.timeWindow <= 25;
  const high = checkIn.energy >= 4 && checkIn.mood >= 4 && checkIn.timeWindow >= 60;
  const level = complexity(task.title);
  const effort = effortMinutes(task);
  let score = urgency(task, now);

  score += effort <= checkIn.timeWindow ? 30 : -10;
  if (low) {
    score += task.progress * 0.4 + (4 - level) * 8;
  } else if (high) {
    score += (100 - task.progress) * 0.15 + (level - 2) * 8;
  } else {
    score += task.progress * 0.15;
  }

  return score;
}

export function sortBestFit(tasks: Task[], checkIn: CheckIn, now: number): Task[] {
  return [...tasks].sort((a, b) => {
    const difference = bestFitScore(b, checkIn, now) - bestFitScore(a, checkIn, now);
    if (difference !== 0) return difference;
    if (a.deadline !== null && b.deadline !== null) return a.deadline - b.deadline;
    return b.createdAt - a.createdAt;
  });
}

export type TaskSuggestions = {
  fit: TaskSuggestion[];
  boost: TaskSuggestion[];
};

export function taskSuggestions(
  tasks: Task[],
  checkIn: CheckIn | null,
  now: number,
): TaskSuggestions {
  if (!checkIn) return { fit: [], boost: [] };
  const low = checkIn.energy <= 2 || checkIn.mood <= 2 || checkIn.timeWindow <= 25;
  const high = checkIn.energy >= 4 && checkIn.mood >= 4 && checkIn.timeWindow >= 60;

  const fit = [...tasks]
    .sort((a, b) => bestFitScore(b, checkIn, now) - bestFitScore(a, checkIn, now))
    .slice(0, 3)
    .map((task) => {
      let reason = `Fits your ${checkIn.timeWindow}-minute window.`;
      if (low && task.progress >= 50) {
        reason = `Small step: already at ${task.progress}%.`;
      } else if (high && complexity(task.title) === 3) {
        reason = "Deeper work that matches your energy.";
      } else if (effortMinutes(task) > checkIn.timeWindow) {
        reason = "Highest priority among the remaining tasks.";
      }
      return { taskId: task.id, title: task.title, reason };
    });

  const boost = [...tasks]
    .filter((task) => task.progress >= 40 && effortMinutes(task) <= checkIn.timeWindow)
    .sort((a, b) => {
      const score =
        b.progress +
        (3 - complexity(b.title)) * 10 +
        urgency(b, now) -
        (a.progress + (3 - complexity(a.title)) * 10 + urgency(a, now));
      return score;
    })
    .slice(0, 3)
    .map((task) => ({
      taskId: task.id,
      title: task.title,
      reason: `Quick win at ${task.progress}% — likely to lift momentum.`,
    }));

  return { fit, boost };
}
