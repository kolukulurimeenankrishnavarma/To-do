export const SNAPSHOT_HISTORY_LIMIT = 32;

/**
 * Remember a locally saved state snapshot so a late SSE echo of that exact
 * state can be ignored even after newer edits have replaced local state.
 */
export function rememberSnapshot(history: string[], serialized: string): void {
  const existing = history.indexOf(serialized);
  if (existing !== -1) history.splice(existing, 1);
  history.push(serialized);
  if (history.length > SNAPSHOT_HISTORY_LIMIT) history.shift();
}
