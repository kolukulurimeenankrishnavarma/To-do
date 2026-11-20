import { fail, readBody } from "./http.mjs";
import {
  enforceTaskPermissions,
  requireHost,
  requireTeam,
} from "./permissions.mjs";
import { emptyState, normalizeState } from "./state.mjs";
import { sendInviteEmail } from "./smtp.mjs";
import { newId, normalizeName, parseEmail, parsedOrFail } from "./validation.mjs";
import {
  getUserByEmail,
  isMember,
  memberIds,
  pendingInvites,
  requireExistingUser,
} from "./views.mjs";

export function createTeamRoutes({ store, responses, publicBase }) {
  async function createTeam(req, res, auth, clientId) {
    const body = await readBody(req);
    const name = normalizeName(body.name).slice(0, 80);

    const team = await store.mutate((db) => {
      const user = requireExistingUser(
        db,
        auth.user.id,
        401,
        "Your account is no longer available.",
      );

      const now = Date.now();
      const created = {
        id: newId("team"),
        name: name || `${user.name}'s team`,
        hostId: user.id,
        createdAt: now,
        members: [{ userId: user.id, role: "host", joinedAt: now }],
        invites: [],
        state: emptyState(),
      };
      db.teams.push(created);
      return created;
    });

    responses.commitAndNotify(res, {
      targets: [auth.user.id],
      exceptClientId: clientId,
      status: 201,
      payload: { teamId: team.id },
    });
  }

  async function updatePrivateState(req, res, auth, clientId) {
    const body = await readBody(req);
    const next = normalizeState(body.state);

    await store.mutate((current) => {
      requireExistingUser(current, auth.user.id, 401, "Your account is no longer available.");
      current.data[auth.user.id] = next;
    });

    responses.commitAndNotify(res, {
      targets: [auth.user.id],
      exceptClientId: clientId,
      withRevision: true,
    });
  }

  async function updateTeamState(req, res, auth, teamId, clientId) {
    const body = await readBody(req);
    const next = normalizeState(body.state);

    const members = await store.mutate((current) => {
      const team = requireTeam(current, teamId);
      if (!isMember(team, auth.user.id)) {
        fail(403, "You are not a member of this team.");
      }

      // A save prepared before a member was removed can arrive afterwards.
      // Never let that stale snapshot reassign open work to a former member.
      const currentMembers = new Set(memberIds(team));
      next.tasks = next.tasks.map((task) =>
        task.assigneeId && !currentMembers.has(task.assigneeId)
          ? { ...task, assigneeId: null }
          : task,
      );

      enforceTaskPermissions(team, next, auth.user.id);
      team.state = next;
      return memberIds(team);
    });

    responses.commitAndNotify(res, {
      targets: members,
      exceptClientId: clientId,
      withRevision: true,
    });
  }

  async function invite(req, res, auth, teamId, clientId) {
    const body = await readBody(req);

    const { email, key } = parsedOrFail(parseEmail(body.email));

    const result = await store.mutate((db) => {
      const team = requireTeam(db, teamId);
      requireHost(team, auth.user.id, "invite teammates");

      const existing = getUserByEmail(db, key);
      if (existing && isMember(team, existing.id)) {
        fail(409, `${existing.name} is already on this team.`);
      }

      const duplicate = pendingInvites(team).some(
        (invite) => invite.emailKey === key,
      );
      if (duplicate) {
        fail(409, `An invitation for “${email}” is already pending.`);
      }

      const invite = {
        id: newId("invite"),
        email,
        emailKey: key,
        invitedByUserId: auth.user.id,
        createdAt: Date.now(),
        status: "pending",
        respondedAt: null,
        acceptedByUserId: null,
      };
      team.invites.unshift(invite);

      return {
        invite,
        teamName: team.name,
        inviteeId: existing ? existing.id : null,
      };
    });

    const base = publicBase(req);
    const inviteUrl = `${base}/?invite=${encodeURIComponent(result.invite.id)}`;

    const delivery = await sendInviteEmail({
      to: email,
      teamName: result.teamName,
      inviterName: auth.user.name,
      link: inviteUrl,
    });

    responses.commitAndNotify(res, {
      targets: [auth.user.id, result.inviteeId],
      exceptClientId: clientId,
      payload: {
        teamId,
        invite: result.invite,
        inviteUrl,
        emailSent: delivery.sent,
        emailError: delivery.error,
      },
    });
  }

  async function inviteResponse(
    req,
    res,
    auth,
    teamId,
    inviteId,
    action,
    clientId,
  ) {
    const result = await store.mutate((db) => {
      const team = requireTeam(db, teamId);

      const invite = team.invites.find(
        (entry) => entry.id === inviteId && entry.status === "pending",
      );
      if (!invite) fail(404, "This invitation is no longer available.");

      if (invite.emailKey !== auth.user.emailKey) {
        fail(
          403,
          `This invitation was sent to ${invite.email}. Sign in with that email to respond.`,
        );
      }

      if (action === "accept") {
        if (isMember(team, auth.user.id)) {
          fail(409, "You're already on this team.");
        }
        team.members.push({
          userId: auth.user.id,
          role: "member",
          joinedAt: Date.now(),
        });
        invite.status = "accepted";
        invite.respondedAt = Date.now();
        invite.acceptedByUserId = auth.user.id;
      } else {
        invite.status = "declined";
        invite.respondedAt = Date.now();
      }

      return memberIds(team);
    });

    responses.commitAndNotify(res, {
      targets: [...result, auth.user.id],
      exceptClientId: clientId,
      payload: { teamId },
    });
  }

  async function cancelInvite(req, res, auth, teamId, inviteId, clientId) {
    const result = await store.mutate((db) => {
      const team = requireTeam(db, teamId);
      requireHost(team, auth.user.id, "cancel invitations");

      const invite = team.invites.find(
        (entry) => entry.id === inviteId && entry.status === "pending",
      );
      if (!invite) fail(404, "This invitation is no longer pending.");

      team.invites = team.invites.filter((entry) => entry.id !== inviteId);
      const invitee = getUserByEmail(db, invite.emailKey);
      return { members: memberIds(team), inviteeId: invitee ? invitee.id : null };
    });

    responses.commitAndNotify(res, {
      targets: [...result.members, result.inviteeId],
      exceptClientId: clientId,
      payload: { teamId },
    });
  }

  async function removeMember(req, res, auth, teamId, memberId, clientId) {
    const result = await store.mutate((db) => {
      const team = requireTeam(db, teamId);
      requireHost(team, auth.user.id, "remove teammates");

      if (memberId === auth.user.id) {
        fail(400, "Delete the team instead of removing yourself.");
      }

      if (!isMember(team, memberId)) {
        fail(404, "That person is not a member of this team.");
      }

      team.members = team.members.filter(
        (member) => member.userId !== memberId,
      );
      // Completed work stays in history, but open work returns to the pool so
      // the team does not lose track of tasks the removed member owned.
      team.state.tasks = team.state.tasks.map((task) =>
        task.assigneeId === memberId ? { ...task, assigneeId: null } : task,
      );

      return { members: memberIds(team), removedId: memberId };
    });

    responses.commitAndNotify(res, {
      targets: [...result.members, result.removedId],
      exceptClientId: clientId,
      payload: { teamId },
    });
  }

  async function deleteTeam(req, res, auth, teamId, clientId) {
    const members = await store.mutate((db) => {
      const team = requireTeam(db, teamId);
      requireHost(team, auth.user.id, "delete this team");

      const ids = memberIds(team);
      db.teams = db.teams.filter((entry) => entry.id !== teamId);
      return ids;
    });

    responses.commitAndNotify(res, { targets: members, exceptClientId: clientId });
  }

  return {
    createTeam,
    updatePrivateState,
    updateTeamState,
    invite,
    inviteResponse,
    cancelInvite,
    removeMember,
    deleteTeam,
  };
}
