import type { CompletedTask, Task, Workspace } from "../types";

type ManageOptions = {
  /**
   * Team work with no assignee can still be claimed by any member. Progress,
   * completion, and history actions opt in; rename/delete of open tasks do not.
   */
  allowUnassigned?: boolean;
};

/**
 * Single client-side ownership guard. It mirrors the server rules: private
 * work is always manageable; team work belongs to its assignee, with an
 * explicit exception for unassigned work a member is about to claim.
 */
export function canManage(
  workspace: Workspace,
  task: Task | CompletedTask | null | undefined,
  userId: string,
  { allowUnassigned = false }: ManageOptions = {},
): boolean {
  if (!task) return false;
  if (workspace !== "team") return true;

  return (
    task.assigneeId === userId ||
    (allowUnassigned && task.assigneeId === null)
  );
}
