import { useState } from "react";
import { fullTimestamp, relativeTime } from "../lib/date";
import type { PublicUser, Task, Workspace } from "../types";
import { DeadlineBadge } from "./DeadlineBadge";
import { EditableTitle } from "./EditableTitle";
import { CheckIcon, TrashIcon } from "./Icons";
import { ProgressControls } from "./ProgressControls";
import { ProgressLog } from "./ProgressLog";

type TaskItemProps = {
  task: Task;
  now: number;
  workspace: Workspace;
  members: PublicUser[];
  currentUserId: string;
  isEntering: boolean;
  isLeaving: boolean;
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onAssign: (id: string, assigneeId: string | null) => void;
  onProgressChange: (id: string, value: number) => void;
  onLogProgress: (id: string, note: string) => void;
};

export function TaskItem({
  task,
  now,
  workspace,
  members,
  currentUserId,
  isEntering,
  isLeaving,
  onComplete,
  onDelete,
  onRename,
  onAssign,
  onProgressChange,
  onLogProgress,
}: TaskItemProps) {
  const [logOpen, setLogOpen] = useState(false);

  const isTeamTask = workspace === "team";
  const isUnassigned = isTeamTask && task.assigneeId === null;
  const isAssignee = !isTeamTask || task.assigneeId === currentUserId;
  const canComplete = isAssignee || isUnassigned;
  const canEditProgress = isAssignee || isUnassigned;
  const canManage = isAssignee;
  const assignee = members.find((member) => member.id === task.assigneeId);
  const lockedReason =
    isTeamTask && !isAssignee && !isUnassigned
      ? `Only ${assignee?.name ?? "the assigned member"} can complete this task or change its progress. You can comment or reassign it.`
      : null;
  const manageReason = canManage
    ? undefined
    : isUnassigned
      ? "Update this task's progress or finish it to claim it before renaming or deleting it."
      : (lockedReason ?? undefined);
  const claimHint = isUnassigned
    ? "Unassigned — update its progress or mark it done to claim it."
    : null;

  const className = [
    "item",
    isEntering ? "item--enter" : "",
    isLeaving ? "item--leaving" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <li className={className} id={`task-${task.id}`} data-id={task.id}>
      <button
        type="button"
        className={`check${canComplete ? "" : " check--locked"}`}
        data-action="complete"
        aria-label={
          canComplete
            ? isUnassigned
              ? `Claim and mark "${task.title}" as done`
              : `Mark "${task.title}" as done`
            : lockedReason ?? undefined
        }
        title={
          canComplete
            ? isUnassigned
              ? "Claim and mark as done"
              : "Mark as done"
            : lockedReason ?? undefined
        }
        disabled={!canComplete}
        onClick={() => onComplete(task.id)}
      >
        <CheckIcon />
      </button>

      <div className="item__body">
        <EditableTitle
          title={task.title}
          ariaLabel={`Rename "${task.title}"`}
          disabled={!canManage}
          disabledReason={manageReason}
          onSave={(title) => onRename(task.id, title)}
        />

        <div className="item__meta-row">
          <p className="item__meta" title={fullTimestamp(task.createdAt)}>
            Added {relativeTime(task.createdAt, now)}
          </p>
          {task.deadline !== null ? (
            <DeadlineBadge deadline={task.deadline} now={now} />
          ) : null}
          {workspace === "team" ? (
            <label className="assignee">
              <span className="assignee__label">Assigned</span>
              <select
                className="assignee__select"
                data-action="assignee"
                aria-label={`Assignee for "${task.title}"`}
                value={task.assigneeId ?? ""}
                onChange={(event) =>
                  onAssign(task.id, event.target.value || null)
                }
              >
                <option value="">Unassigned</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>

        {lockedReason ? (
          <p className="item__permission" id={`permission-${task.id}`}>
            {lockedReason}
          </p>
        ) : null}

        {claimHint ? <p className="item__permission">{claimHint}</p> : null}

        <ProgressControls
          task={task}
          canEditProgress={canEditProgress}
          lockedReason={lockedReason ?? undefined}
          onProgressChange={(value) => onProgressChange(task.id, value)}
          onLog={(note) => {
            onLogProgress(task.id, note);
            setLogOpen(true);
          }}
        />

        <ProgressLog
          task={task}
          open={logOpen}
          now={now}
          onOpenChange={setLogOpen}
        />
      </div>

      <button
        type="button"
        className={`icon-btn${canManage ? "" : " icon-btn--locked"}`}
        data-action="delete"
        aria-label={`Delete "${task.title}"`}
        title={canManage ? "Delete task" : manageReason}
        disabled={!canManage}
        onClick={() => onDelete(task.id)}
      >
        <TrashIcon />
      </button>
    </li>
  );
}
