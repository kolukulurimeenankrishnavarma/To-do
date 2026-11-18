function fallbackSuffix(length: number): string {
  return `${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 2 + length)}`;
}

/** Stable client identifier shared by API requests and SSE connections. */
export function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return fallbackSuffix(8);
}

/** Task identifiers keep the historical `task_` fallback prefix. */
export function taskId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `task_${fallbackSuffix(7)}`;
}
