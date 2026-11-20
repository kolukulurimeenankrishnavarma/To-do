import { fail } from "./http.mjs";
import { emptyState, normalizeState } from "./state.mjs";

export function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    mobile: user.mobile,
    createdAt: user.createdAt,
  };
}

export function getUser(db, userId) {
  return db.users.find((user) => user.id === userId) ?? null;
}

export function requireExistingUser(db, userId, status, message) {
  const user = getUser(db, userId);
  if (!user) fail(status, message);
  return user;
}

export function getUserByEmail(db, emailKey) {
  return db.users.find((user) => user.emailKey === emailKey) ?? null;
}

export function isMember(team, userId) {
  return team.members.some((member) => member.userId === userId);
}

export function memberIds(team) {
  return team.members.map((member) => member.userId);
}

export function pendingInvites(team) {
  return team.invites
    .filter((invite) => invite.status === "pending")
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function teamView(db, team, userId) {
  const hostUser = getUser(db, team.hostId);
  const members = team.members
    .map((member) => getUser(db, member.userId))
    .filter(Boolean);
  const isHost = team.hostId === userId;

  return {
    team,
    host: hostUser ? publicUser(hostUser) : null,
    members: members.map(publicUser),
    isHost,
    pendingInvites: isHost ? pendingInvites(team) : [],
  };
}

export function invitesForUser(db, user) {
  return db.teams
    .flatMap((team) => {
      if (isMember(team, user.id)) return [];
      return pendingInvites(team)
        .filter((invite) => invite.emailKey === user.emailKey)
        .map((invite) => {
          const hostUser = getUser(db, team.hostId);
          return {
            team,
            host: hostUser ? publicUser(hostUser) : null,
            invite,
          };
        });
    })
    .sort((a, b) => b.invite.createdAt - a.invite.createdAt);
}

export function sessionPayload(db, user) {
  const teams = db.teams
    .filter((team) => isMember(team, user.id))
    .sort((a, b) => {
      const aOwned = a.hostId === user.id ? 0 : 1;
      const bOwned = b.hostId === user.id ? 0 : 1;
      return (
        aOwned - bOwned ||
        a.createdAt - b.createdAt ||
        a.name.localeCompare(b.name)
      );
    })
    .map((team) => teamView(db, team, user.id));

  const memberTeamIds = new Set(teams.map((view) => view.team.id));
  const invites = invitesForUser(db, user).filter(
    ({ team }) => !memberTeamIds.has(team.id),
  );

  return {
    user: publicUser(user),
    state: normalizeState(db.data[user.id] ?? emptyState()),
    teams,
    invites,
    revision: db.revision,
  };
}
