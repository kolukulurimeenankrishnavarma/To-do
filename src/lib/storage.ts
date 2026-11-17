import type { AppState } from "../types";

export function emptyState(): AppState {
  return { tasks: [], history: [] };
}
