export const INSIGHTS_VERSION = 1;
export const DAY_MS = 86_400_000;

export const RECURRENCE_INTERVALS = {
  daily: DAY_MS,
  weekly: 7 * DAY_MS,
  biweekly: 14 * DAY_MS,
  monthly: 30 * DAY_MS,
};

const CADENCE_TOLERANCE = {
  daily: 0.35,
  weekly: 0.25,
  biweekly: 0.25,
  monthly: 0.25,
};

function isRecord(value) {
  return typeof value === "object" && value !== null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function finiteNumber(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function cleanText(value, max) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function teamHasMember(team, userId) {
  return team.members.some((member) => member.userId === userId);
}

/** Strip generated #123 suffixes and punctuation before comparing titles. */
export function titleKey(title) {
  return cleanText(title, 200)
    .replace(/#\d+/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function emptyInsights() {
  return {
    version: INSIGHTS_VERSION,
    checkIn: null,
    recurringRules: [],
    dismissedNudges: [],
    updatedAt: 0,
  };
}

export function normalizeCheckIn(value) {
  if (!isRecord(value)) return null;

  const createdAt = finiteNumber(value.createdAt, 0);
  if (createdAt <= 0) return null;

  return {
    energy: clamp(Math.round(finiteNumber(value.energy, 3)), 1, 5),
    mood: clamp(Math.round(finiteNumber(value.mood, 3)), 1, 5),
    focus: clamp(Math.round(finiteNumber(value.focus, 3)), 1, 5),
    timeWindow: clamp(Math.round(finiteNumber(value.timeWindow, 30)), 10, 480),
    goal: cleanText(value.goal, 120),
    blockers: cleanText(value.blockers, 280),
    createdAt,
  };
}

export function normalizeRecurringRule(value) {
  if (!isRecord(value)) return null;

  const key = titleKey(value.titleKey ?? value.title);
  if (!key) return null;

  const cadence =
    typeof value.cadence === "string" && value.cadence in RECURRENCE_INTERVALS
      ? value.cadence
      : "weekly";
  const intervalMs = Math.round(
    clamp(
      finiteNumber(value.intervalMs, RECURRENCE_INTERVALS[cadence]),
      DAY_MS,
      90 * DAY_MS,
    ),
  );
  const lastCreatedAt = finiteNumber(value.lastCreatedAt, 0);
  if (lastCreatedAt <= 0) return null;

  const sourceTaskIds = Array.isArray(value.sourceTaskIds)
    ? value.sourceTaskIds
        .filter((id) => typeof id === "string" && id.length > 0)
        .slice(0, 20)
    : [];

  return {
    id: typeof value.id === "string" && value.id ? value.id : `rule_${key}`,
    titleKey: key,
    title: cleanText(value.title, 200) || key,
    cadence,
    intervalMs,
    lastCreatedAt,
    createdAt: finiteNumber(value.createdAt, lastCreatedAt),
    sourceTaskIds,
    targetTeamId:
      typeof value.targetTeamId === "string" && value.targetTeamId
        ? value.targetTeamId
        : null,
    enabled: value.enabled !== false,
  };
}

export function normalizeInsights(value) {
  const base = emptyInsights();
  if (!isRecord(value)) return base;

  const rules = Array.isArray(value.recurringRules)
    ? value.recurringRules
        .map(normalizeRecurringRule)
        .filter((rule) => rule !== null)
    : [];
  const seen = new Set();
  const recurringRules = rules.filter((rule) => {
    const dedupeKey = `${rule.titleKey}|${rule.targetTeamId ?? ""}`;
    if (seen.has(dedupeKey)) return false;
    seen.add(dedupeKey);
    return true;
  });

  return {
    version: INSIGHTS_VERSION,
    checkIn: normalizeCheckIn(value.checkIn),
    recurringRules,
    dismissedNudges: Array.isArray(value.dismissedNudges)
      ? value.dismissedNudges
          .filter((id) => typeof id === "string" && id.length <= 80)
          .slice(0, 20)
      : [],
    updatedAt: finiteNumber(value.updatedAt, 0),
  };
}

function cadenceForGap(gap) {
  for (const [cadence, interval] of Object.entries(RECURRENCE_INTERVALS)) {
    if (Math.abs(gap - interval) <= interval * CADENCE_TOLERANCE[cadence]) {
      return cadence;
    }
  }
  return null;
}

/**
 * Infer recurring work from completed history. A rule needs at least two
 * completions with a consistent gap; the most recent completion seeds
 * `lastCreatedAt` so the first run only creates work once that gap has passed.
 */
export function detectRecurringRules(state, existingRules = [], now = Date.now()) {
  const history = Array.isArray(state?.history) ? state.history : [];
  const groups = new Map();

  for (const item of history) {
    if (!isRecord(item) || !Number.isFinite(item.completedAt)) continue;
    const key = titleKey(item.title);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }

  const existing = new Set(
    existingRules
      .filter((rule) => rule?.titleKey)
      .map((rule) => `${rule.titleKey}|${rule.targetTeamId ?? ""}`),
  );
  const detected = [];

  for (const [key, items] of groups) {
    if (existing.has(`${key}|`)) continue;
    if (items.length < 2) continue;

    items.sort((a, b) => a.completedAt - b.completedAt);
    const gaps = items
      .slice(1)
      .map((item, index) => item.completedAt - items[index].completedAt)
      .filter((gap) => gap > 0);
    if (gaps.length === 0) continue;

    const recentGaps = gaps.slice(-4);
    const average =
      recentGaps.reduce((sum, gap) => sum + gap, 0) / recentGaps.length;
    const cadence = cadenceForGap(average);
    if (!cadence) continue;

    const last = items[items.length - 1];
    // A very old final completion should not immediately flood the list.
    if (now - last.completedAt < RECURRENCE_INTERVALS[cadence] * 0.75) continue;

    detected.push({
      id: `rule_${key.replace(/[^a-z0-9]+/g, "_")}`,
      titleKey: key,
      title: cleanText(last.title.replace(/#\d+/g, "").trim(), 200) || key,
      cadence,
      intervalMs: RECURRENCE_INTERVALS[cadence],
      lastCreatedAt: last.completedAt,
      createdAt: now,
      sourceTaskIds: items.slice(-5).map((item) => item.id),
      targetTeamId: null,
      enabled: true,
    });
  }

  return detected;
}

/**
 * Return the rules that are allowed to write right now. Missing or inaccessible
 * teams are reported so the caller can disable those rules safely.
 */
export function classifyRulesForRun(db, userId, insights) {
  const ready = [];
  const disabled = [];

  for (const rule of insights.recurringRules) {
    if (!rule.enabled) continue;

    if (rule.targetTeamId) {
      const team = db.teams.find((entry) => entry.id === rule.targetTeamId);
      if (!team || !teamHasMember(team, userId)) {
        disabled.push(rule.id);
        continue;
      }
    }

    ready.push(rule);
  }

  return { ready, disabled };
}
