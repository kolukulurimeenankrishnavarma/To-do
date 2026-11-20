import { useState } from "react";
import { useAsyncAction } from "../lib/useAsyncAction";
import type {
  PublicUser,
  TeamActionResult,
  TeamInviteView,
} from "../types";
import { UserIcon } from "./Icons";

type TeamInvitationsProps = {
  invites: TeamInviteView[];
  onAcceptInvite: (
    teamId: string,
    inviteId: string,
  ) => Promise<TeamActionResult>;
  onDeclineInvite: (
    teamId: string,
    inviteId: string,
  ) => Promise<TeamActionResult>;
};

export function TeamInvitations({
  invites,
  onAcceptInvite,
  onDeclineInvite,
}: TeamInvitationsProps) {
  const [error, setError] = useState("");
  const { busy, run: runAction } = useAsyncAction();

  if (invites.length === 0) return null;

  async function run(action: () => Promise<TeamActionResult>) {
    if (busy) return;
    setError("");
    const result = await runAction(action);
    if (result && !result.ok) setError(result.error);
  }

  return (
    <div className="team-gate-stack" id="team-invitations">
      {invites.map(({ team, host, invite }, index) => (
        <section
          className="card team-gate team-invitation-card"
          id={index === 0 ? "team-invitation" : undefined}
          data-team-id={team.id}
          data-invite-id={invite.id}
          key={invite.id}
          aria-labelledby={`team-invitation-heading-${invite.id}`}
        >
          <div className="team-gate__icon" aria-hidden="true">
            <UserIcon />
          </div>
          <h2
            className="team-gate__title"
            id={`team-invitation-heading-${invite.id}`}
          >
            You're invited to {team.name}
          </h2>
          <p className="team-gate__text">
            {host ? host.name : "The team host"} invited{" "}
            <strong>{invite.email}</strong> to join this team. Accept to see
            shared tasks, assign work, and track progress together.
          </p>
          <div className="team-gate__actions">
            <button
              className="btn btn--primary"
              id={index === 0 ? "team-invitation-accept" : undefined}
              type="button"
              data-action="accept-invite"
              disabled={busy}
              onClick={() => void run(() => onAcceptInvite(team.id, invite.id))}
            >
              Accept invitation
            </button>
            <button
              className="btn btn--ghost"
              id={index === 0 ? "team-invitation-decline" : undefined}
              type="button"
              data-action="decline-invite"
              disabled={busy}
              onClick={() => void run(() => onDeclineInvite(team.id, invite.id))}
            >
              Decline
            </button>
          </div>
        </section>
      ))}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

type TeamGateProps = {
  user: PublicUser;
  invites: TeamInviteView[];
  onCreateTeam: () => Promise<TeamActionResult>;
  onAcceptInvite: (
    teamId: string,
    inviteId: string,
  ) => Promise<TeamActionResult>;
  onDeclineInvite: (
    teamId: string,
    inviteId: string,
  ) => Promise<TeamActionResult>;
};

export function TeamGate({
  user,
  invites,
  onCreateTeam,
  onAcceptInvite,
  onDeclineInvite,
}: TeamGateProps) {
  const [error, setError] = useState("");
  const { busy, run: runAction } = useAsyncAction();

  async function runCreate() {
    if (busy) return;
    setError("");
    const result = await runAction(onCreateTeam);
    if (result && !result.ok) setError(result.error);
  }

  return (
    <div className="team-gate-stack">
      <TeamInvitations
        invites={invites}
        onAcceptInvite={onAcceptInvite}
        onDeclineInvite={onDeclineInvite}
      />

      <section
        className="card team-gate"
        id="team-gate"
        aria-labelledby="team-gate-heading"
      >
        <div className="team-gate__icon" aria-hidden="true">
          <UserIcon />
        </div>
        <h2 className="team-gate__title" id="team-gate-heading">
          Start a team of your own
        </h2>
        <p className="team-gate__text">
          Create your own team and become its host. You can then invite
          teammates by email, assign shared tasks, and monitor everyone's
          progress from one place.
        </p>
        {invites.length > 0 ? (
          <p className="team-gate__hint">
            Accept an invitation above, or create a separate team. You can be
            part of more than one team.
          </p>
        ) : null}
        <div className="team-gate__actions">
          <button
            className="btn btn--primary"
            id="team-create-submit"
            type="button"
            disabled={busy}
            onClick={() => void runCreate()}
          >
            {busy ? "Creating…" : "Create team"}
          </button>
        </div>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <p className="team-gate__hint">
          Your private tasks stay separate and are only visible to you.
        </p>
      </section>

      <p className="team-gate__signed-in">
        Signed in as <strong>{user.email}</strong>
      </p>
    </div>
  );
}
