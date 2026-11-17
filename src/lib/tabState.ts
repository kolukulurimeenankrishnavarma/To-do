import { TAB_TEAM_KEY } from "./constants";
import { getSessionStorage } from "./localStorage";

/**
 * The active team is chosen per tab, so two tabs can look at different teams
 * while the signed-in account stays the same.
 */
export function readTabTeamId(): string | null {
  const storage = getSessionStorage();
  if (!storage) return null;

  try {
    const value = storage.getItem(TAB_TEAM_KEY);
    return value ? value : null;
  } catch {
    return null;
  }
}

export function rememberTeamId(teamId: string | null): void {
  const storage = getSessionStorage();
  if (!storage) return;

  try {
    if (teamId) storage.setItem(TAB_TEAM_KEY, teamId);
    else storage.removeItem(TAB_TEAM_KEY);
  } catch {
    // Ignore storage restrictions.
  }
}
