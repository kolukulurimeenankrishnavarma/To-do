import type { AppState } from "../types";

export function emptyState(): AppState {
  return { tasks: [], history: [] };
}

/**
 * Browsers can throw when storage is disabled or full. Every caller uses the
 * same fallback policy: return null and keep working for this page only.
 */
function safeStorage(kind: "local" | "session"): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export function safeLocalStorage(): Storage | null {
  return safeStorage("local");
}

export function safeSessionStorage(): Storage | null {
  return safeStorage("session");
}
