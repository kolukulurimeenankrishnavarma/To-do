const INSIGHTS_VERSION = 1;
const MOOD_QUESTIONS_PER_DAY = 3;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(value) {
  return typeof value === "object" && value !== null;
}

function numberIn(value, fallback, min, max, integer = false) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const clamped = Math.min(max, Math.max(min, value));
  return integer ? Math.round(clamped) : clamped;
}

function text(value, max) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function emptyInsights() {
  return {
    version: INSIGHTS_VERSION,
    checkIn: null,
    lastPromptDay: null,
    updatedAt: 0,
  };
}

/**
 * Check-ins are private to one account. Keep the same strict shape as the
 * client rule engine so a crafted request cannot inject oversized or invalid
 * personalization data into the JSON database.
 */
export function normalizeInsights(value) {
  if (!isRecord(value)) return emptyInsights();

  let checkIn = null;
  if (isRecord(value.checkIn)) {
    const raw = value.checkIn;
    const day =
      typeof raw.day === "string" && DAY_PATTERN.test(raw.day) ? raw.day : "";
    const createdAt = numberIn(raw.createdAt, 0, 0, Number.MAX_SAFE_INTEGER);
    const answers = [];
    const seen = new Set();

    if (Array.isArray(raw.answers)) {
      for (const entry of raw.answers) {
        if (!isRecord(entry)) continue;
        const id = text(entry.id, 40);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        answers.push({
          id,
          prompt: text(entry.prompt, 120),
          value: numberIn(entry.value, 3, 1, 5, true),
        });
      }
    }

    if (day && createdAt > 0 && answers.length > 0) {
      checkIn = {
        day,
        energy: numberIn(raw.energy, 3, 1, 5, true),
        mood: numberIn(raw.mood, 3, 1, 5),
        timeWindow: numberIn(raw.timeWindow, 30, 10, 480, true),
        answers: answers.slice(0, MOOD_QUESTIONS_PER_DAY),
        createdAt,
      };
    }
  }

  const lastPromptDay =
    typeof value.lastPromptDay === "string" && DAY_PATTERN.test(value.lastPromptDay)
      ? value.lastPromptDay
      : null;

  return {
    version: INSIGHTS_VERSION,
    checkIn,
    lastPromptDay,
    updatedAt: numberIn(value.updatedAt, 0, 0, Number.MAX_SAFE_INTEGER),
  };
}
