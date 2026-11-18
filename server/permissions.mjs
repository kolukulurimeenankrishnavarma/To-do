import { fail } from "./http.mjs";

/**
 * Team state is saved as a whole snapshot, so permissions are checked by
 * comparing the incoming snapshot with the stored one. Members may always
 * comment on and reassign work, but only the responsible member can move a
 * task to history or change its progress. Unassigned tasks can be claimed by
 * any member as they work on them.
 */
export function enforceTaskPermissions(team, next, userId) {
  const previousTasks = new Map(
    team.state.tasks.map((task) => [task.id, task]),
  );
  const previousHistory = new Map(
    team.state.history.map((task) => [task.id, task]),
  );
  const nextTasks = new Map(next.tasks.map((task) => [task.id, task]));
  const nextHistory = new Map(next.history.map((task) => [task.id, task]));

  for (const [id, previous] of previousTasks) {
    const nextTask = nextTasks.get(id);
    const finished = nextHistory.get(id);

    if (!nextTask && finished) {
      if (previous.assigneeId && previous.assigneeId !== userId) {
        fail(403, "Only the assigned member can complete this task.");
      }
      if (!previous.assigneeId) {
        // Finishing an unassigned task claims it for the member who did it.
        finished.assigneeId = userId;
      }
      continue;
    }

    if (!nextTask) {
      if (previous.assigneeId !== userId) {
        fail(403, "Only the assigned member can delete this task.");
      }
      continue;
    }

    if (nextTask.progress !== previous.progress) {
      const owner = previous.assigneeId ?? nextTask.assigneeId;
      if (owner !== userId) {
        fail(403, "Only the assigned member can change this task's progress.");
      }
    }

    if (nextTask.title !== previous.title && previous.assigneeId !== userId) {
      fail(403, "Only the assigned member can rename this task.");
    }
  }

  for (const [id, previous] of previousHistory) {
    const nextItem = nextHistory.get(id);
    const restored = nextTasks.get(id);

    if (!nextItem) {
      // Either removed from history or moved back to the to-do list.
      const owner = previous.assigneeId;
      if (owner !== null && owner !== userId) {
        fail(
          403,
          restored
            ? "Only the assigned member can restore this task."
            : "Only the assigned member can remove this task from history.",
        );
      }
      continue;
    }

    if (nextItem.title !== previous.title) {
      const owner = previous.assigneeId;
      if (owner !== null && owner !== userId) {
        fail(403, "Only the assigned member can rename this task.");
      }
    }
  }
}

/** Shared host-only guard for every team mutation. */
export function requireHost(team, userId, action) {
  const membership = team.members.find((member) => member.userId === userId);
  if (!membership || membership.role !== "host" || team.hostId !== userId) {
    fail(403, `Only the team host can ${action}.`);
  }
}

/** Shared team lookup so every handler returns the same 404. */
export function requireTeam(db, teamId) {
  const team = db.teams.find((entry) => entry.id === teamId);
  if (!team) fail(404, "This team is no longer available.");
  return team;
}
