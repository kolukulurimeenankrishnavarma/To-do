import type {
  AppState,
  CheckIn,
  CompletedTask,
  Insights,
  RecurrenceCadence,
  RecurrenceRule,
  Task,
} from "../types";

export const INSIGHTS_VERSION = 1;
export const DAY_MS = 86_400_000;
export const BASELINE_DURATION_DAYS = 9;

const RECURRENCE_INTERVALS: Record<RecurrenceCadence, number> = {
  daily: DAY_MS,
  weekly: 7 * DAY_MS,
  biweekly: 14 * DAY_MS,
  monthly: 30 * DAY_MS,
};

const CADENCE_TOLERANCE: Record<RecurrenceCadence, number> = {
  daily: 0.35,
  weekly: 0.25,
  biweekly: 0.25,
  monthly: 0.25,
};

const COMPLEX_VERBS = [
  "refactor",
  "migrate",
  "automate",
  "implement",
  "deploy",
  "optimize",
];
const LIGHT_VERBS = ["review", "audit", "analyze", "design"];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : fallback;
}

function cleanText(value: unknown, max: number): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function emptyInsights(): Insights {
  return {
    version: INSIGHTS_VERSION,
    checkIn: null,
    recurringRules: [],
    dismissedNudges: [],
    updatedAt: 0,
  };
}

export function titleKey(title: string): string {
  return cleanText(title, 200)
    .replace(/#\d+/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeInsights(value: unknown): Insights {
  if (!value || typeof value !== "object") return emptyInsights();
  const input = value as Record<string, unknown>;

  let checkIn: CheckIn | null = null;
  if (input.checkIn && typeof input.checkIn === "object") {
    const raw = input.checkIn as Record<string, unknown>;
    const createdAt = finite(raw.createdAt, 0);
    if (createdAt > 0) {
      checkIn = {
        energy: clamp(Math.round(finite(raw.energy, 3)), 1, 5),
        mood: clamp(Math.round(finite(raw.mood, 3)), 1, 5),
        focus: clamp(Math.round(finite(raw.focus, 3)), 1, 5),
        timeWindow: clamp(Math.round(finite(raw.timeWindow, 30)), 10, 480),
        goal: cleanText(raw.goal, 120),
        blockers: cleanText(raw.blockers, 280),
        createdAt,
      };
    }
  }

  const recurringRules: RecurrenceRule[] = [];
  const seen = new Set<string>();
  if (Array.isArray(input.recurringRules)) {
    for (const entry of input.recurringRules) {
      if (!entry || typeof entry !== "object") continue;
      const raw = entry as Record<string, unknown>;
      const key = titleKey(String(raw.titleKey ?? raw.title ?? ""));
      if (!key) continue;
      const cadence: RecurrenceCadence =
        typeof raw.cadence === "string" && raw.cadence in RECURRENCE_INTERVALS
          ? (raw.cadence as RecurrenceCadence)
          : "weekly";
      const targetTeamId =
        typeof raw.targetTeamId === "string" && raw.targetTeamId
          ? raw.targetTeamId
          : null;
      const dedupe = `${key}|${targetTeamId ?? ""}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);

      recurringRules.push({
        id: typeof raw.id === "string" && raw.id ? raw.id : `rule_${key}`,
        titleKey: key,
        title: cleanText(raw.title, 200) || key,
        cadence,
        intervalMs: clamp(
          Math.round(finite(raw.intervalMs, RECURRENCE_INTERVALS[cadence])),
          DAY_MS,
          90 * DAY_MS,
        ),
        lastCreatedAt: finite(raw.lastCreatedAt, 0),
        createdAt: finite(raw.createdAt, Date.now()),
        sourceTaskIds: Array.isArray(raw.sourceTaskIds)
          ? raw.sourceTaskIds
              .filter((id): id is string => typeof id === "string")
              .slice(0, 20)
          : [],
        targetTeamId,
        enabled: raw.enabled !== false,
      });
    }
  }

  return {
    version: INSIGHTS_VERSION,
    checkIn,
    recurringRules,
    dismissedNudges: Array.isArray(input.dismissedNudges)
      ? input.dismissedNudges
          .filter(
            (id): id is string => typeof id === "string" && id.length <= 80,
          )
          .slice(0, 20)
      : [],
    updatedAt: finite(input.updatedAt, 0),
  };
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

function cadenceForGap(gap: number): RecurrenceCadence | null {
  for (const cadence of Object.keys(RECURRENCE_INTERVALS) as RecurrenceCadence[]) {
    const interval = RECURRENCE_INTERVALS[cadence];
    if (Math.abs(gap - interval) <= interval * CADENCE_TOLERANCE[cadence]) {
      return cadence;
    }
  }
  return null;
}

/** Infer candidate rules; the UI asks before storing any of them. */
export function detectRecurringRules(
  state: AppState,
  existingRules: RecurrenceRule[],
  targetTeamId: string | null,
  now = Date.now(),
): RecurrenceRule[] {
  const groups = new Map<string, CompletedTask[]>();
  for (const item of state.history) {
    const key = titleKey(item.title);
    if (!key) continue;
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }

  const existing = new Set(
    existingRules.map((rule) => `${rule.titleKey}|${rule.targetTeamId ?? ""}`),
  );
  const found: RecurrenceRule[] = [];

  for (const [key, items] of groups) {
    if (existing.has(`${key}|${targetTeamId ?? ""}`) || items.length < 2) {
      continue;
    }

    const sorted = [...items].sort((a, b) => a.completedAt - b.completedAt);
    const gaps = sorted
      .slice(1)
      .map((item, index) => item.completedAt - sorted[index].completedAt)
      .filter((gap) => gap > 0);
    if (gaps.length === 0) continue;

    const recent = gaps.slice(-4);
    const average = recent.reduce((sum, gap) => sum + gap, 0) / recent.length;
    const cadence = cadenceForGap(average);
    if (!cadence) continue;

    const last = sorted[sorted.length - 1];
    if (now - last.completedAt < RECURRENCE_INTERVALS[cadence] * 0.75) {
      continue;
    }

    found.push({
      id: `rule_${key.replace(/[^a-z0-9]+/g, "_")}`,
      titleKey: key,
      title: cleanText(last.title.replace(/#\d+/g, "").trim(), 200) || key,
      cadence,
      intervalMs: RECURRENCE_INTERVALS[cadence],
      lastCreatedAt: last.completedAt,
      createdAt: now,
      sourceTaskIds: sorted.slice(-5).map((item) => item.id),
      targetTeamId,
      enabled: true,
    });
  }

  return found;
}

function complexity(title: string): number {
  const key = titleKey(title);
  if (COMPLEX_VERBS.some((verb) => key.startsWith(verb))) return 3;
  if (LIGHT_VERBS.some((verb) => key.startsWith(verb))) return 1;
  return 2;
}

export type BestFitContext = {
  checkIn: CheckIn | null;
  history: CompletedTask[];
  now: number;
};

/** Higher scores belong earlier in the best-fit view. */
export function bestFitScore(task: Task, context: BestFitContext): number {
  const { checkIn, history, now } = context;
  if (!checkIn) return 0;

  const lowCapacity =
    checkIn.energy <= 2 || checkIn.focus <= 2 || checkIn.timeWindow <= 25;
  const highCapacity =
    checkIn.energy >= 4 && checkIn.focus >= 4 && checkIn.timeWindow >= 60;
  const level = complexity(task.title);
  let score = 20;

  score += lowCapacity ? task.progress * 0.5 : (100 - task.progress) * 0.18;
  score += (4 - level) * (lowCapacity ? 6 : -4);

  const estimateMinutes = 15 + level * 15;
  score += estimateMinutes <= checkIn.timeWindow ? 12 : -10;

  if (task.deadline !== null) {
    const days = (task.deadline - now) / DAY_MS;
    if (days < 0) score += 40;
    else if (days < 1) score += 28;
    else if (days < 3) score += 18;
    else if (days < 7) score += 10;
  }

  const lastLog = task.progressLog[task.progressLog.length - 1];
  if (lastLog && now - lastLog.at > 5 * DAY_MS) score += highCapacity ? 8 : 3;

  const goalWords = words(checkIn.goal);
  if (goalWords.size > 0 && overlapCount(goalWords, words(task.title)) > 0) {
    score += 10;
  }

  const blockerWords = words(checkIn.blockers);
  if (
    blockerWords.size > 0 &&
    overlapCount(blockerWords, words(task.title)) > 0
  ) {
    score -= 8;
  }

  if (checkIn.mood <= 2 && task.progress >= 50) score += 6;
  if (checkIn.mood >= 4 && level === 3) score += 4;

  const similar = history.filter(
    (item) => overlapCount(words(item.title), words(task.title)) >= 2,
  ).length;
  score += Math.min(similar, 4);

  return score;
}

export function sortBestFit(
  tasks: Task[],
  context: BestFitContext,
): Task[] {
  return [...tasks].sort((a, b) => {
    const difference = bestFitScore(b, context) - bestFitScore(a, context);
    if (difference !== 0) return difference;
    if (a.deadline !== null && b.deadline !== null) {
      return a.deadline - b.deadline;
    }
    return b.createdAt - a.createdAt;
  });
}

export function deadlineAdvice(
  title: string,
  deadline: number | null,
  state: AppState,
  now: number,
): string | null {
  const trimmed = title.trim();
  if (!trimmed) return null;

  const key = titleKey(trimmed);
  const taskWords = words(trimmed);
  const durations = state.history
    .filter((item) => {
      const keyMatch = titleKey(item.title) === key;
      return keyMatch || overlapCount(words(item.title), taskWords) >= 2;
    })
    .map((item) => (item.completedAt - item.createdAt) / DAY_MS)
    .filter((days) => days > 0 && days < 180);

  const estimate = durations.length > 0 ? median(durations) : BASELINE_DURATION_DAYS;
  const rounded = Math.max(1, Math.round(estimate));

  if (deadline === null) {
    return `Similar work has taken about ${rounded} day${
      rounded === 1 ? "" : "s"
    } here. Add a deadline when you're ready.`;
  }

  const available = (deadline - now) / DAY_MS;
  if (available < estimate * 0.6) {
    return `Similar work has taken about ${rounded} day${
      rounded === 1 ? "" : "s"
    }. This deadline may be tight.`;
  }
  if (available > estimate * 3 && estimate >= BASELINE_DURATION_DAYS) {
    return `Similar work has taken about ${rounded} days, so there's room to pull this deadline closer.`;
  }
  return null;
}

export type InsightNudge = {
  id: string;
  text: string;
};

export function insightNudges(
  state: AppState,
  insights: Insights,
  now = Date.now(),
): InsightNudge[] {
  const nudges: InsightNudge[] = [];
  const weekAgo = now - 7 * DAY_MS;

  if (!insights.checkIn || insights.checkIn.createdAt < weekAgo) {
    nudges.push({
      id: "checkin",
      text: "Check in so Taskly can suggest a best-fit order for your current energy.",
    });
  }

  const overdue = state.tasks.filter(
    (task) => task.deadline !== null && task.deadline < now,
  ).length;
  if (overdue >= 3) {
    nudges.push({
      id: "overdue",
      text: `${overdue} tasks are overdue. The Overdue view still puts the oldest deadlines first.`,
    });
  }

  const stalled = state.tasks.filter((task) => {
    const last = task.progressLog[task.progressLog.length - 1];
    return task.progress > 0 && last && now - last.at > 5 * DAY_MS;
  }).length;
  if (stalled >= 2) {
    nudges.push({
      id: "stalled",
      text: `${stalled} in-progress tasks haven't had an update in a while. A short check-in can surface quick wins.`,
    });
  }

  if (state.tasks.length >= 5) {
    const undated = state.tasks.filter((task) => task.deadline === null).length;
    if (undated >= 5) {
      nudges.push({
        id: "undated",
        text: `${undated} tasks have no deadline. Best-fit ordering uses progress and complexity when dates are missing.`,
      });
    }
  }

  if (insights.checkIn?.blockers) {
    nudges.push({
      id: "blockers",
      text: `Noted: ${insights.checkIn.blockers} Best-fit ordering will avoid work that matches that blocker.`,
    });
  }

  return nudges.filter(
    (nudge) => !insights.dismissedNudges.includes(nudge.id),
  );
}
