import { useState } from "react";
import { fullTimestamp, relativeTime } from "../lib/date";
import type { CompletedTask, PublicUser, Workspace } from "../types";
import { DeadlineBadge } from "./DeadlineBadge";
import { EditableTitle } from "./EditableTitle";
import { CheckIcon, TrashIcon, UndoIcon, UserIcon } from "./Icons";
import { ProgressLog } from "./ProgressLog";

type HistoryItemProps = {
  item: CompletedTask;
  now: number;
  workspace: Workspace;
  members: PublicUser[];
  currentUserId: string;
  isEntering: boolean;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
};

export function HistoryItem({
  item,
  now,
  workspace,
  members,
  currentUserId,
  isEntering,
  onRestore,
  onDelete,
  onRename,
}: HistoryItemProps) {
  const [logOpen, setLogOpen] = useState(false);
  const assignee = members.find((member) => member.id === item.assigneeId);
  const isTeamTask = workspace === "team";
  const canManage =
    !isTeamTask ||
    item.assigneeId === null ||
    item.assigneeId === currentUserId;
  const manageReason = !isTeamTask
    ? undefined
    : item.assigneeId === null
      ? undefined
      : `Only ${assignee?.name ?? "the assigned member"} can rename, restore, or delete this finished task.`;

  return (
    <li
      className={`item item--done${isEntering ? " item--enter" : ""}`}
      data-id={item.id}
    >
      <span className="check check--done" aria-hidden="true">
        <CheckIcon />
      </span>

      <div className="item__body">
        <EditableTitle
          title={item.title}
          ariaLabel={`Rename "${item.title}"`}
          disabled={!canManage}
          disabledReason={manageReason}
          onSave={(title) => onRename(item.id, title)}
        />

        <div className="item__meta-row">
          <p className="item__meta" title={fullTimestamp(item.completedAt)}>
            Completed {relativeTime(item.completedAt, now)}
          </p>
          {item.deadline !== null ? (
            <DeadlineBadge
              deadline={item.deadline}
              completedAt={item.completedAt}
              now={now}
            />
          ) : null}
          {workspace === "team" ? (
            <span
              className="assignee assignee--static"
              title={assignee ? assignee.email : "No assignee"}
            >
              <UserIcon className="assignee__icon" />
              {assignee ? assignee.name : "Unassigned"}
            </span>
          ) : null}
        </div>

        <div
          className={`progress progress--static${
            item.progress === 100 ? " progress--complete" : ""
          }`}
        >
          <div className="progress__track">
            <div
              className="progress__fill"
              style={{ width: `${item.progress}%` }}
            />
          </div>
          <span className="progress__value" aria-hidden="true">
            {item.progress}%
          </span>
        </div>

        <ProgressLog
          task={item}
          open={logOpen}
          now={now}
          onOpenChange={setLogOpen}
        />
      </div>

      <button
        type="button"
        className={`icon-btn${canManage ? "" : " icon-btn--locked"}`}
        data-action="restore"
        aria-label={`Move "${item.title}" back to to-do`}
        title={canManage ? "Move back to to-do" : manageReason}
        disabled={!canManage}
        onClick={() => onRestore(item.id)}
      >
        <UndoIcon />
      </button>

      <button
        type="button"
        className={`icon-btn${canManage ? "" : " icon-btn--locked"}`}
        data-action="delete"
        aria-label={`Remove "${item.title}" from history`}
        title={canManage ? "Remove from history" : manageReason}
        disabled={!canManage}
        onClick={() => onDelete(item.id)}
      >
        <TrashIcon />
      </button>
    </li>
  );
}
