import { useState, type FormEvent } from "react";
import { fullTimestamp, relativeTime } from "../lib/date";
import { isOverdue } from "../lib/tasks";
import { useAsyncAction } from "../lib/useAsyncAction";
import type {
  CompletedTask,
  PublicUser,
  Task,
  TeamActionResult,
  TeamInvite,
  TeamInviteResult,
} from "../types";
import { UserIcon } from "./Icons";

type TeamOverviewProps = {
  teamName: string;
  members: PublicUser[];
  tasks: Task[];
  history: CompletedTask[];
  now: number;
  hostId: string | null;
  currentUserId: string;
  isHost: boolean;
  pendingInvites: TeamInvite[];
  onInvite: (email: string) => Promise<TeamInviteResult>;
  onCancelInvite: (inviteId: string) => Promise<TeamActionResult>;
  onRemoveMember: (memberId: string) => Promise<TeamActionResult>;
  onDeleteTeam: () => Promise<TeamActionResult>;
};

type MemberSummary = {
  member: PublicUser;
  open: number;
  progress: number;
  overdue: number;
  completed: number;
  total: number;
};

type InviteMessage = {
  kind: "success" | "error";
  text: string;
  link?: string;
};

function inviteLink(inviteId: string): string {
  const base =
    typeof window === "undefined"
      ? ""
      : `${window.location.origin}${window.location.pathname}`;
  return `${base}?invite=${encodeURIComponent(inviteId)}`;
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the selection-based fallback.
  }

  try {
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(field);
    return copied;
  } catch {
    return false;
  }
}

export function TeamOverview({
  teamName,
  members,
  tasks,
  history,
  now,
  hostId,
  currentUserId,
  isHost,
  pendingInvites,
  onInvite,
  onCancelInvite,
  onRemoveMember,
  onDeleteTeam,
}: TeamOverviewProps) {
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteMessage, setInviteMessage] = useState<InviteMessage | null>(null);
  const [manageMessage, setManageMessage] = useState<InviteMessage | null>(
    null,
  );
  const inviteAction = useAsyncAction();
  const manageAction = useAsyncAction();
  const busy = inviteAction.busy;
  const managing = manageAction.busy;

  const host = members.find((member) => member.id === hostId) ?? null;
  const unassigned = tasks.filter(
    (task) =>
      task.assigneeId === null ||
      !members.some((member) => member.id === task.assigneeId),
  ).length;
  const overdue = tasks.filter((task) => isOverdue(task, now)).length;

  const summaries: MemberSummary[] = members.map((member) => {
    const open = tasks.filter((task) => task.assigneeId === member.id);
    const completed = history.filter(
      (item) => item.assigneeId === member.id,
    ).length;
    const total = open.length + completed;

    // Completed work stays in the denominator, so finishing a task raises the
    // member's overall progress instead of making the bar reset to zero.
    const points =
      open.reduce((sum, task) => sum + task.progress, 0) + completed * 100;
    const progress = total === 0 ? 0 : Math.round(points / total);

    return {
      member,
      open: open.length,
      progress,
      overdue: open.filter((task) => isOverdue(task, now)).length,
      completed,
      total,
    };
  });

  const updates = tasks
    .flatMap((task) => {
      const latest = task.progressLog[task.progressLog.length - 1];
      if (!latest) return [];

      const author = latest.by
        ? members.find((member) => member.id === latest.by)
        : null;
      const assignee = members.find((member) => member.id === task.assigneeId);
      const member = author ?? assignee;
      return [
        {
          taskId: task.id,
          title: task.title,
          value: latest.value,
          at: latest.at,
          note: latest.note,
          member: member ? member.name : "Unassigned",
        },
      ];
    })
    .sort((a, b) => b.at - a.at)
    .slice(0, 6);

  async function handleInviteSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const result = await inviteAction.run(() => onInvite(inviteEmail));
    if (!result) return;

    if (!result.ok) {
      setInviteMessage({ kind: "error", text: result.error });
      return;
    }

    const link =
      result.inviteUrl ??
      (result.invite ? inviteLink(result.invite.id) : undefined);

    const text = result.emailSent
      ? `Invitation emailed to ${inviteEmail.trim().toLowerCase()}.`
      : `Invitation created for ${inviteEmail
          .trim()
          .toLowerCase()}. Share the link below — email delivery is not configured.`;

    setInviteMessage({ kind: "success", text, link });
    setInviteEmail("");
  }

  async function handleCancel(inviteId: string) {
    if (busy) return;

    const result = await inviteAction.run(() => onCancelInvite(inviteId));
    if (!result) return;

    if (!result.ok) {
      setInviteMessage({ kind: "error", text: result.error });
      return;
    }

    setInviteMessage({
      kind: "success",
      text: "Invitation cancelled.",
    });
  }

  async function handleCopy(inviteId: string) {
    const link = inviteLink(inviteId);
    const copied = await copyText(link);

    setInviteMessage({
      kind: copied ? "success" : "error",
      text: copied
        ? "Invite link copied. Send it to your teammate."
        : "Couldn't copy automatically. Select the link and copy it manually.",
      link,
    });
  }

  async function handleRemoveMember(member: PublicUser) {
    if (managing) return;

    const confirmed = window.confirm(
      `Remove ${member.name} from ${teamName}? Their open tasks will become unassigned.`,
    );
    if (!confirmed) return;

    setManageMessage(null);
    const result = await manageAction.run(() => onRemoveMember(member.id));
    if (!result) return;

    if (!result.ok) {
      setManageMessage({ kind: "error", text: result.error });
      return;
    }

    setManageMessage({
      kind: "success",
      text: `${member.name} was removed from the team. Their open tasks are now unassigned.`,
    });
  }

  async function handleDeleteTeam() {
    if (managing) return;

    const confirmed = window.confirm(
      `Delete ${teamName} for every member? Shared tasks and membership will be removed and this can't be undone.`,
    );
    if (!confirmed) return;

    setManageMessage(null);
    const result = await manageAction.run(() => onDeleteTeam());
    if (!result) return;

    if (!result.ok) {
      setManageMessage({ kind: "error", text: result.error });
    }
  }

  return (
    <section
      className="card team-overview"
      id="team-overview"
      aria-labelledby="team-overview-heading"
    >
      <div className="card__head">
        <h2 className="card__title" id="team-overview-heading">
          {teamName}{" "}
          <span className="pill" id="team-member-count">
            {members.length}
          </span>
        </h2>
        <span className="team-overview__hint">
          {host ? `Hosted by ${host.name}` : "Shared on the Taskly server"}
        </span>
      </div>

      <div className="team-summary">
        <div className="team-summary__item">
          <span className="team-summary__value" id="team-open-count">
            {tasks.length}
          </span>
          <span className="team-summary__label">Open</span>
        </div>
        <div className="team-summary__item team-summary__item--danger">
          <span className="team-summary__value" id="team-overdue-count">
            {overdue}
          </span>
          <span className="team-summary__label">Overdue</span>
        </div>
        <div className="team-summary__item">
          <span className="team-summary__value" id="team-unassigned-count">
            {unassigned}
          </span>
          <span className="team-summary__label">Unassigned</span>
        </div>
      </div>

      {isHost ? (
        <div className="team-invites">
          <form className="team-invite-form" onSubmit={handleInviteSubmit}>
            <label className="team-invite-form__label" htmlFor="team-invite-email">
              Invite a teammate by email
            </label>
            <div className="team-invite-form__row">
              <input
                id="team-invite-email"
                type="email"
                autoComplete="email"
                placeholder="teammate@example.com"
                value={inviteEmail}
                disabled={busy}
                onChange={(event) => {
                  setInviteEmail(event.target.value);
                  if (inviteMessage) setInviteMessage(null);
                }}
              />
              <button
                className="btn btn--primary"
                id="team-invite-submit"
                type="submit"
                disabled={busy}
              >
                {busy ? "Inviting…" : "Invite"}
              </button>
            </div>
          </form>

          {inviteMessage ? (
            <div
              className={`team-invite-message team-invite-message--${inviteMessage.kind}`}
              id="team-invite-message"
              role="status"
            >
              <p>{inviteMessage.text}</p>
              {inviteMessage.link ? (
                <p className="team-invite-message__link">
                  <a href={inviteMessage.link}>{inviteMessage.link}</a>
                </p>
              ) : null}
            </div>
          ) : null}

          {pendingInvites.length > 0 ? (
            <ul
              className="team-invite-list"
              id="team-invite-list"
              aria-label="Pending invitations"
            >
              {pendingInvites.map((invite) => (
                <li
                  className="team-invite"
                  data-email={invite.email}
                  key={invite.id}
                >
                  <span className="team-invite__email">{invite.email}</span>
                  <span className="team-invite__status">Pending</span>
                  <button
                    className="btn btn--ghost team-invite__copy"
                    type="button"
                    data-action="copy-invite"
                    onClick={() => void handleCopy(invite.id)}
                  >
                    Copy link
                  </button>
                  <button
                    className="btn btn--ghost team-invite__cancel"
                    type="button"
                    data-action="cancel-invite"
                    disabled={busy}
                    onClick={() => void handleCancel(invite.id)}
                  >
                    Cancel
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <ul className="team-members" aria-label="Team members and workload">
        {summaries.map(
          ({ member, open, progress, overdue, completed, total }) => (
            <li
              className="team-member"
              data-member-id={member.id}
              key={member.id}
            >
              <div className="team-member__identity">
                <span className="team-member__avatar" aria-hidden="true">
                  <UserIcon />
                </span>
                <span className="team-member__person">
                  <span className="team-member__name-row">
                    <span className="team-member__name">{member.name}</span>
                    {member.id === hostId ? (
                      <span className="team-member__badge">Host</span>
                    ) : null}
                    {member.id === currentUserId ? (
                      <span className="team-member__badge team-member__badge--you">
                        You
                      </span>
                    ) : null}
                  </span>
                  <span className="team-member__email">{member.email}</span>
                </span>
              </div>

              <div className="team-member__stats">
                <span className="team-member__stat" data-stat="assigned">
                  {open} assigned
                </span>
                <span
                  className={`team-member__stat team-member__stat--overdue${
                    overdue === 0 ? " team-member__stat--clear" : ""
                  }`}
                  data-stat="overdue"
                >
                  {overdue} overdue
                </span>
                <span className="team-member__stat" data-stat="completed">
                  {completed} done
                </span>
                {isHost && member.id !== hostId ? (
                  <button
                    className="btn btn--ghost team-member__remove"
                    type="button"
                    data-action="remove-member"
                    data-member-id={member.id}
                    aria-label={`Remove ${member.name} from the team`}
                    disabled={managing}
                    onClick={() => void handleRemoveMember(member)}
                  >
                    Remove
                  </button>
                ) : null}
              </div>

              <div
                className="team-member__progress"
                aria-label={`${member.name}: ${progress}% overall progress`}
              >
                <div className="team-member__track">
                  <div
                    className={`team-member__fill${
                      total > 0 && progress === 100
                        ? " team-member__fill--complete"
                        : ""
                    }`}
                    style={{ width: `${total === 0 ? 0 : progress}%` }}
                  />
                </div>
                <span className="team-member__percent">
                  {total === 0 ? "—" : `${progress}%`}
                </span>
              </div>
            </li>
          ),
        )}
      </ul>

      <div className="team-updates">
        <h3 className="team-updates__title">Latest progress updates</h3>
        {updates.length === 0 ? (
          <p className="team-updates__empty">
            No progress updates yet. Log progress on a team task to keep
            everyone in the loop.
          </p>
        ) : (
          <ul className="team-updates__list" id="team-updates">
            {updates.map((update) => (
              <li
                className="team-update"
                key={`${update.taskId}-${update.at}`}
                data-task-id={update.taskId}
              >
                <span className="team-update__value">{update.value}%</span>
                <span className="team-update__task">{update.title}</span>
                <span className="team-update__member">{update.member}</span>
                <time
                  className="team-update__time"
                  dateTime={new Date(update.at).toISOString()}
                  title={`Updated ${relativeTime(update.at, now)}`}
                >
                  {fullTimestamp(update.at)}
                </time>
                {update.note ? (
                  <span className="team-update__note">{update.note}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {manageMessage ? (
        <div
          className={`team-invite-message team-invite-message--${manageMessage.kind} team-manage-message`}
          id="team-manage-message"
          role="status"
        >
          <p>{manageMessage.text}</p>
        </div>
      ) : null}

      {isHost ? (
        <div className="team-danger" id="team-danger-zone">
          <div className="team-danger__text">
            <h3 className="team-danger__title">Delete this team</h3>
            <p>
              Removing everyone is permanent. Shared tasks and membership will
              be deleted for every member.
            </p>
          </div>
          <button
            className="btn btn--danger"
            id="team-delete"
            type="button"
            disabled={managing}
            onClick={() => void handleDeleteTeam()}
          >
            {managing ? "Working…" : "Delete team"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
