import { useEffect, useMemo, useRef, useState } from "react";
import { HistoryItem } from "./HistoryItem";
import { StatsBar } from "./StatsBar";
import { TaskForm } from "./TaskForm";
import { TaskItem } from "./TaskItem";
import { TaskToolbar } from "./TaskToolbar";
import { TeamGate, TeamInvitations } from "./TeamGate";
import { TeamOverview } from "./TeamOverview";
import { ThemeToggle } from "./ThemeToggle";
import { UserIcon } from "./Icons";
import { savePrivateState, saveTeamState } from "../lib/api";
import { formatToday } from "../lib/date";
import { taskId } from "../lib/id";
import { appendProgressEntry, clampProgress } from "../lib/progress";
import { emptyState } from "../lib/storage";
import { readStoredSort, rememberSort } from "../lib/sortPreference";
import { readTabTeamId, rememberTeamId } from "../lib/tabState";
import type { Theme } from "../lib/theme";
import { useTransientFlag } from "../lib/useTransientFlag";
import {
  completionEntry,
  filterTasks,
  isOverdue,
  isPending,
  sortTasks,
  taskStats,
} from "../lib/tasks";
import type {
  AppState,
  PublicUser,
  Task,
  TaskFilter,
  TaskSort,
  TeamActionResult,
  TeamInviteResult,
  TeamInviteView,
  TeamView,
  Workspace,
} from "../types";

function initialTeamId(teams: TeamView[]): string | null {
  const remembered = readTabTeamId();
  if (remembered && teams.some((view) => view.team.id === remembered)) {
    return remembered;
  }
  return teams[0]?.team.id ?? null;
}

type TasklyBoardProps = {
  user: PublicUser;
  initialState: AppState;
  teams: TeamView[];
  invites: TeamInviteView[];
  focusInviteId?: string | null;
  onCreateTeam: () => Promise<TeamActionResult>;
  onInvite: (teamId: string, email: string) => Promise<TeamInviteResult>;
  onAcceptInvite: (
    teamId: string,
    inviteId: string,
  ) => Promise<TeamActionResult>;
  onDeclineInvite: (
    teamId: string,
    inviteId: string,
  ) => Promise<TeamActionResult>;
  onCancelInvite: (
    teamId: string,
    inviteId: string,
  ) => Promise<TeamActionResult>;
  onRemoveTeamMember: (
    teamId: string,
    memberId: string,
  ) => Promise<TeamActionResult>;
  onDeleteTeam: (teamId: string) => Promise<TeamActionResult>;
  onLogout: () => void | Promise<void>;
  theme: Theme;
  onToggleTheme: () => void;
};

const VIEWS: { id: TaskFilter; label: string }[] = [
  { id: "all", label: "All tasks" },
  { id: "pending", label: "Pending" },
  { id: "overdue", label: "Overdue" },
  { id: "completed", label: "Completed" },
];

export function TasklyBoard({
  user,
  initialState,
  teams,
  invites,
  focusInviteId = null,
  onCreateTeam,
  onInvite,
  onAcceptInvite,
  onDeclineInvite,
  onCancelInvite,
  onLogout,
  onRemoveTeamMember,
  onDeleteTeam,
  theme,
  onToggleTheme,
}: TasklyBoardProps) {
  const [privateState, setPrivateState] = useState<AppState>(initialState);
  const [teamStates, setTeamStates] = useState<Record<string, AppState>>(() =>
    Object.fromEntries(teams.map((view) => [view.team.id, view.team.state])),
  );
  const [activeTeamId, setActiveTeamId] = useState<string | null>(() =>
    initialTeamId(teams),
  );
  const [workspace, setWorkspace] = useState<Workspace>(
    focusInviteId || (teams.length === 0 && invites.length > 0)
      ? "team"
      : "private",
  );
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [sort, setSort] = useState<TaskSort>(() => readStoredSort() ?? "newest");
  const [now, setNow] = useState(() => Date.now());
  const [leavingIds, setLeavingIds] = useState<string[]>([]);
  const [enteringTaskId, setEnteringTaskId] = useState<string | null>(null);
  const [enteringHistoryId, setEnteringHistoryId] = useState<string | null>(null);
  const [historyFlash, triggerHistoryFlash] = useTransientFlag(750);

  const pendingCompletions = useRef(new Set<string>());
  const privateLocalSnapshot = useRef(JSON.stringify(initialState));
  const privatePropsSnapshot = useRef(JSON.stringify(initialState));
  const teamSnapshots = useRef<Record<string, string>>(
    Object.fromEntries(
      teams.map((view) => [
        view.team.id,
        JSON.stringify(view.team.state),
      ]),
    ),
  );
  const teamPropsSnapshots = useRef<Record<string, string>>(
    Object.fromEntries(
      teams.map((view) => [
        view.team.id,
        JSON.stringify(view.team.state),
      ]),
    ),
  );
  const pendingTeamId = useRef<string | null>(null);
  const saveChains = useRef<Record<string, Promise<void>>>({});

  function queueSave(key: string, task: () => Promise<void>) {
    const previous = saveChains.current[key] ?? Promise.resolve();
    saveChains.current[key] = previous.then(task).catch(() => {
      // A later state change will retry with the newest snapshot.
    });
  }

  const activeTeamView =
    teams.find((view) => view.team.id === activeTeamId) ?? teams[0] ?? null;
  const activeTeam = activeTeamView?.team ?? null;
  const state =
    workspace === "private"
      ? privateState
      : activeTeam
        ? (teamStates[activeTeam.id] ?? activeTeam.state)
        : emptyState();
  const members = activeTeamView?.members ?? [];
  const hostId = activeTeamView?.team.hostId ?? null;

  // Keep local team data in sync when membership changes, a new team is added,
  // or another tab updates shared work.
  useEffect(() => {
    setTeamStates((prev) => {
      let changed = false;
      const next = { ...prev };
      const ids = new Set(teams.map((view) => view.team.id));

      for (const view of teams) {
        const serialized = JSON.stringify(view.team.state);
        const propsChanged =
          teamPropsSnapshots.current[view.team.id] !== serialized;
        if (propsChanged) {
          teamPropsSnapshots.current[view.team.id] = serialized;
        }

        if (!(view.team.id in next)) {
          next[view.team.id] = view.team.state;
          teamSnapshots.current[view.team.id] = serialized;
          changed = true;
          continue;
        }

        // Ignore a props echo of the state this tab already has (or is
        // saving), so a refresh cannot roll back unsaved local edits.
        if (!propsChanged) continue;
        if (teamSnapshots.current[view.team.id] === serialized) continue;

        next[view.team.id] = view.team.state;
        teamSnapshots.current[view.team.id] = serialized;
        changed = true;
      }

      for (const id of Object.keys(next)) {
        if (ids.has(id)) continue;
        delete next[id];
        delete teamSnapshots.current[id];
        delete teamPropsSnapshots.current[id];
        changed = true;
      }

      return changed ? next : prev;
    });
  }, [teams]);

  // A removed team or a newly accepted invitation can invalidate the active
  // selection. Wait briefly for a newly created/accepted team to arrive in
  // props before falling back to the first available team.
  useEffect(() => {
    if (
      activeTeamId &&
      teams.some((view) => view.team.id === activeTeamId)
    ) {
      if (pendingTeamId.current === activeTeamId) {
        pendingTeamId.current = null;
      }
      return;
    }

    if (pendingTeamId.current && pendingTeamId.current === activeTeamId) {
      return;
    }

    const nextId = teams[0]?.team.id ?? null;
    setActiveTeamId(nextId);
    rememberTeamId(nextId);
  }, [teams, activeTeamId]);

  // Server refreshes arrive through props. Adopt another client's private
  // snapshot unless it is the one this tab already has or is saving.
  useEffect(() => {
    const serialized = JSON.stringify(initialState);
    if (serialized === privatePropsSnapshot.current) return;
    privatePropsSnapshot.current = serialized;
    if (serialized === privateLocalSnapshot.current) return;

    privateLocalSnapshot.current = serialized;
    setPrivateState(initialState);
  }, [initialState]);

  useEffect(() => {
    const serialized = JSON.stringify(privateState);
    if (serialized === privateLocalSnapshot.current) return;
    privateLocalSnapshot.current = serialized;
    queueSave(`private:${user.id}`, () => savePrivateState(privateState));
  }, [privateState, user.id]);

  useEffect(() => {
    for (const view of teams) {
      const current = teamStates[view.team.id];
      if (!current) continue;

      const serialized = JSON.stringify(current);
      if (serialized === teamSnapshots.current[view.team.id]) continue;

      teamSnapshots.current[view.team.id] = serialized;
      queueSave(`team:${view.team.id}`, () =>
        saveTeamState(view.team.id, current),
      );
    }
  }, [teamStates, teams]);

  useEffect(() => {
    const suffix = workspace === "team" ? "Team" : "Private";
    document.title =
      state.tasks.length > 0
        ? `(${state.tasks.length}) Taskly · ${suffix}`
        : `Taskly · ${suffix}`;
  }, [state.tasks.length, workspace]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!enteringTaskId) return;
    const timer = window.setTimeout(() => setEnteringTaskId(null), 400);
    return () => window.clearTimeout(timer);
  }, [enteringTaskId]);

  useEffect(() => {
    if (!enteringHistoryId) return;
    const timer = window.setTimeout(() => setEnteringHistoryId(null), 400);
    return () => window.clearTimeout(timer);
  }, [enteringHistoryId]);

  function updateState(updater: (prev: AppState) => AppState) {
    if (workspace === "private") {
      setPrivateState(updater);
      return;
    }

    if (!activeTeamId) return;

    setTeamStates((prev) => ({
      ...prev,
      [activeTeamId]: updater(
        prev[activeTeamId] ?? activeTeam?.state ?? emptyState(),
      ),
    }));
  }

  function handleSortChange(next: TaskSort) {
    setSort(next);
    rememberSort(next);
  }

  function switchWorkspace(next: Workspace) {
    if (next === workspace) return;
    setWorkspace(next);
    setFilter("all");
    setLeavingIds([]);
    setEnteringTaskId(null);
    setEnteringHistoryId(null);
  }

  function selectTeam(teamId: string) {
    setActiveTeamId(teamId);
    rememberTeamId(teamId);
    setWorkspace("team");
    setFilter("all");
    setLeavingIds([]);
    setEnteringTaskId(null);
    setEnteringHistoryId(null);
  }

  async function handleCreateTeam(): Promise<TeamActionResult> {
    const result = await onCreateTeam();
    if (!result.ok) return result;

    setWorkspace("team");
    if (result.teamId) {
      const teamId = result.teamId;
      pendingTeamId.current = teamId;
      setTeamStates((prev) => ({
        ...prev,
        [teamId]: prev[teamId] ?? emptyState(),
      }));
      teamSnapshots.current[teamId] = JSON.stringify(emptyState());
      teamPropsSnapshots.current[teamId] = JSON.stringify(emptyState());
      selectTeam(teamId);
    }
    return result;
  }

  async function handleAcceptInvite(
    teamId: string,
    inviteId: string,
  ): Promise<TeamActionResult> {
    const result = await onAcceptInvite(teamId, inviteId);
    if (!result.ok) return result;

    pendingTeamId.current = teamId;
    selectTeam(teamId);
    return result;
  }

  async function handleInvite(email: string): Promise<TeamInviteResult> {
    if (!activeTeam) {
      return { ok: false, error: "Choose a team before inviting teammates." };
    }
    return onInvite(activeTeam.id, email);
  }

  async function handleCancelInvite(
    inviteId: string,
  ): Promise<TeamActionResult> {
    if (!activeTeam) {
      return { ok: false, error: "Choose a team first." };
    }
    return onCancelInvite(activeTeam.id, inviteId);
  }

  async function handleRemoveMember(
    memberId: string,
  ): Promise<TeamActionResult> {
    if (!activeTeam) {
      return { ok: false, error: "Choose a team first." };
    }
    return onRemoveTeamMember(activeTeam.id, memberId);
  }

  async function handleDeleteTeam(): Promise<TeamActionResult> {
    if (!activeTeam) {
      return { ok: false, error: "Choose a team first." };
    }

    const teamId = activeTeam.id;
    const result = await onDeleteTeam(teamId);
    if (!result.ok) return result;

    const remaining = teams.filter((view) => view.team.id !== teamId);
    setTeamStates((prev) => {
      const next = { ...prev };
      delete next[teamId];
      return next;
    });
    delete teamSnapshots.current[teamId];
    delete teamPropsSnapshots.current[teamId];
    if (remaining.length > 0) {
      selectTeam(remaining[0].team.id);
    } else {
      setActiveTeamId(null);
    }
    return result;
  }

  function addTask(
    title: string,
    deadline: number | null,
    assigneeId: string | null,
  ) {
    const task: Task = {
      id: taskId(),
      title,
      createdAt: Date.now(),
      deadline,
      assigneeId: workspace === "team" ? assigneeId : null,
      progress: 0,
      progressLog: [],
    };

    updateState((prev) => ({ ...prev, tasks: [task, ...prev.tasks] }));
    setEnteringTaskId(task.id);
    setFilter("all");
  }

  function renameTask(id: string, title: string) {
    const task = state.tasks.find((item) => item.id === id);
    if (workspace === "team" && (!task || task.assigneeId !== user.id)) return;

    updateState((prev) => ({
      ...prev,
      tasks: prev.tasks.map((task) =>
        task.id === id ? { ...task, title } : task,
      ),
    }));
  }

  function renameHistoryItem(id: string, title: string) {
    const item = state.history.find((entry) => entry.id === id);
    if (
      workspace === "team" &&
      (!item || (item.assigneeId !== null && item.assigneeId !== user.id))
    ) {
      return;
    }

    updateState((prev) => ({
      ...prev,
      history: prev.history.map((item) =>
        item.id === id ? { ...item, title } : item,
      ),
    }));
  }

  function assignTask(id: string, assigneeId: string | null) {
    updateState((prev) => ({
      ...prev,
      tasks: prev.tasks.map((task) =>
        task.id === id ? { ...task, assigneeId } : task,
      ),
    }));
  }

  function changeTaskProgress(id: string, value: number) {
    updateState((prev) => ({
      ...prev,
      tasks: prev.tasks.map((task) => {
        if (task.id !== id) return task;
        if (
          workspace === "team" &&
          task.assigneeId !== null &&
          task.assigneeId !== user.id
        ) {
          return task;
        }

        // Touching an unassigned team task claims it for the signed-in member.
        const assigneeId =
          workspace === "team" && task.assigneeId === null
            ? user.id
            : task.assigneeId;
        return { ...task, assigneeId, progress: clampProgress(value) };
      }),
    }));
  }

  function logTaskProgress(id: string, note: string) {
    updateState((prev) => ({
      ...prev,
      tasks: prev.tasks.map((task) => {
        if (task.id !== id) return task;

        // Members with progress access must move past 0% before logging an
        // update. Comment-only entries at 0% remain available to teammates.
        const canEditProgress =
          workspace !== "team" ||
          task.assigneeId === null ||
          task.assigneeId === user.id;
        if (canEditProgress && task.progress === 0) return task;

        return appendProgressEntry(task, task.progress, Date.now(), note, user.id);
      }),
    }));
  }

  function completeTask(id: string) {
    if (pendingCompletions.current.has(id)) return;

    const task = state.tasks.find((item) => item.id === id);
    if (!task) return;
    if (
      workspace === "team" &&
      task.assigneeId !== null &&
      task.assigneeId !== user.id
    ) {
      return;
    }

    pendingCompletions.current.add(id);
    setLeavingIds((prev) => [...prev, id]);

    window.setTimeout(() => {
      pendingCompletions.current.delete(id);

      updateState((prev) => {
        const current = prev.tasks.find((item) => item.id === id);
        if (!current) return prev;
        if (
          workspace === "team" &&
          current.assigneeId !== null &&
          current.assigneeId !== user.id
        ) {
          return prev;
        }

        // Completing an unassigned team task claims it for the signed-in
        // member, so the finished history shows who actually did the work.
        const claimed =
          workspace === "team" && current.assigneeId === null
            ? { ...current, assigneeId: user.id }
            : current;
        const completed = completionEntry(claimed, Date.now());
        return {
          tasks: prev.tasks.filter((item) => item.id !== id),
          history: [completed, ...prev.history],
        };
      });

      setLeavingIds((prev) => prev.filter((item) => item !== id));
      setEnteringHistoryId(id);

      triggerHistoryFlash();
    }, 170);
  }

  function deleteTask(id: string) {
    const task = state.tasks.find((item) => item.id === id);
    if (workspace === "team" && (!task || task.assigneeId !== user.id)) return;

    updateState((prev) => ({
      ...prev,
      tasks: prev.tasks.filter((task) => task.id !== id),
    }));
  }

  function restoreTask(id: string) {
    const completed = state.history.find((entry) => entry.id === id);
    if (
      workspace === "team" &&
      (!completed ||
        (completed.assigneeId !== null && completed.assigneeId !== user.id))
    ) {
      return;
    }

    updateState((prev) => {
      const item = prev.history.find((entry) => entry.id === id);
      if (!item) return prev;

      const task: Task = {
        id: item.id,
        title: item.title,
        createdAt: item.createdAt,
        deadline: item.deadline,
        assigneeId: item.assigneeId,
        progress: clampProgress(item.progress),
        progressLog: item.progressLog.map((entry) => ({ ...entry })),
      };

      return {
        tasks: [task, ...prev.tasks],
        history: prev.history.filter((entry) => entry.id !== id),
      };
    });

    setEnteringTaskId(id);
    setFilter("all");
  }

  function deleteHistoryItem(id: string) {
    const item = state.history.find((entry) => entry.id === id);
    if (
      workspace === "team" &&
      (!item || (item.assigneeId !== null && item.assigneeId !== user.id))
    ) {
      return;
    }

    updateState((prev) => ({
      ...prev,
      history: prev.history.filter((item) => item.id !== id),
    }));
  }

  function clearTasks() {
    // Clearing everything would bypass the per-task ownership rules in team
    // mode, so bulk clearing stays a private-list action.
    if (workspace === "team") return;
    if (state.tasks.length === 0) return;
    const confirmed = window.confirm(
      `Delete all ${state.tasks.length} pending task${
        state.tasks.length === 1 ? "" : "s"
      }? This can't be undone.`,
    );
    if (!confirmed) return;

    updateState((prev) => ({ ...prev, tasks: [] }));
  }

  function clearHistory() {
    // See clearTasks: team history is cleared one task at a time.
    if (workspace === "team") return;
    if (state.history.length === 0) return;
    const confirmed = window.confirm(
      `Clear all ${state.history.length} finished task${
        state.history.length === 1 ? "" : "s"
      }? This can't be undone.`,
    );
    if (!confirmed) return;

    updateState((prev) => ({ ...prev, history: [] }));
  }

  async function handleLogout() {
    await Promise.allSettled(Object.values(saveChains.current));
    await onLogout();
  }

  const counts = useMemo<Record<TaskFilter, number>>(
    () => ({
      all: state.tasks.length + state.history.length,
      pending: state.tasks.filter((task) => isPending(task, now)).length,
      overdue: state.tasks.filter((task) => isOverdue(task, now)).length,
      completed: state.history.length,
    }),
    [state.tasks, state.history, now],
  );

  const visibleTasks = useMemo(
    () =>
      filter === "completed"
        ? []
        : sortTasks(filterTasks(state.tasks, filter, now), sort),
    [state.tasks, filter, sort, now],
  );

  const stats = useMemo(
    () => taskStats(state.tasks, state.history, now),
    [state.tasks, state.history, now],
  );

  const pendingLabel = workspace === "team" ? "Team tasks" : "To do";
  const showTasks = filter !== "completed";
  const showHistory = filter === "all" || filter === "completed";
  const taskHeading =
    filter === "pending"
      ? "Pending tasks"
      : filter === "overdue"
        ? "Overdue tasks"
        : pendingLabel;
  const filteredEmpty =
    filter === "pending"
      ? {
          title: "Nothing pending",
          text: "Open tasks with active deadlines will appear here.",
        }
      : {
          title: "Nothing overdue",
          text: "Tasks past their target date and time will appear here.",
        };

  return (
    <main className="app">
      <header className="app__header">
        <div className="app__heading">
          <div className="app__title-row">
            <h1 className="app__title">Taskly</h1>
            <div
              className="workspace-toggle"
              role="group"
              aria-label="Task workspace"
            >
              <button
                type="button"
                id="workspace-private"
                className={`workspace-toggle__btn${
                  workspace === "private" ? " workspace-toggle__btn--active" : ""
                }`}
                aria-pressed={workspace === "private"}
                onClick={() => switchWorkspace("private")}
              >
                My tasks
              </button>
              <button
                type="button"
                id="workspace-team"
                className={`workspace-toggle__btn${
                  workspace === "team" ? " workspace-toggle__btn--active" : ""
                }`}
                aria-pressed={workspace === "team"}
                onClick={() => switchWorkspace("team")}
              >
                Team tasks
                {invites.length > 0 ? (
                  <span className="workspace-toggle__badge">
                    {invites.length}
                  </span>
                ) : null}
              </button>
            </div>
          </div>
          <p className="app__subtitle">
            {workspace === "private"
              ? "Add tasks, track progress with notes, and file finished work in your private history."
              : activeTeamView
                ? "Coordinate shared work, assign responsibilities, and keep progress visible to everyone."
                : invites.length > 0
                  ? "Review your team invitations or create a team of your own."
                  : "Create a team, invite teammates, and share work in this browser."}
          </p>
        </div>
        <div className="app__meta">
          <div className="app__date">{formatToday(new Date(now))}</div>
          <div className="app__account">
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
            <span
              className="user-chip"
              title={`Signed in as ${user.name} (${user.email})`}
            >
              <span className="user-chip__avatar" aria-hidden="true">
                <UserIcon />
              </span>
              <span className="user-chip__name">{user.name}</span>
            </span>
            <button
              className="btn btn--ghost app__logout"
              type="button"
              onClick={handleLogout}
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <div className="app__layout">
        <aside className="sidebar" aria-label="Task views">
          <p className="sidebar__title">Views</p>
          <nav className="views">
            {VIEWS.map((view) => (
              <button
                className={`view${filter === view.id ? " view--active" : ""}`}
                type="button"
                key={view.id}
                id={`view-${view.id}`}
                aria-pressed={filter === view.id}
                onClick={() => setFilter(view.id)}
              >
                <span className="view__label">{view.label}</span>
                <span className="view__count" id={`view-${view.id}-count`}>
                  {counts[view.id]}
                </span>
              </button>
            ))}
          </nav>
          <p className="sidebar__hint">
            Views update live from the Taskly server.
          </p>
        </aside>

        <div className="app__content">
          {workspace === "private" ? <StatsBar stats={stats} /> : null}

          {workspace === "private" && invites.length > 0 ? (
            <section className="card invite-banner" id="invite-banner">
              <div className="invite-banner__text">
                <strong>
                  {invites.length} team invitation
                  {invites.length === 1 ? "" : "s"}
                </strong>{" "}
                waiting for {user.email}.
              </div>
              <button
                className="btn btn--primary"
                id="invite-banner-review"
                type="button"
                onClick={() => switchWorkspace("team")}
              >
                Review invitations
              </button>
            </section>
          ) : null}

          {workspace === "team" && !activeTeamView ? (
            <TeamGate
              user={user}
              invites={invites}
              onCreateTeam={handleCreateTeam}
              onAcceptInvite={handleAcceptInvite}
              onDeclineInvite={onDeclineInvite}
            />
          ) : (
            <>
              {workspace === "team" && activeTeamView ? (
                <>
                  <section
                    className="card team-switcher"
                    id="team-switcher"
                    aria-label="Your teams"
                  >
                    <div className="team-switcher__list">
                      {teams.map((view) => (
                        <button
                          className={`team-switcher__btn${
                            view.team.id === activeTeam?.id
                              ? " team-switcher__btn--active"
                              : ""
                          }`}
                          type="button"
                          key={view.team.id}
                          data-team-id={view.team.id}
                          aria-pressed={view.team.id === activeTeam?.id}
                          onClick={() => selectTeam(view.team.id)}
                        >
                          {view.team.name}
                          {view.isHost ? (
                            <span className="team-switcher__badge">Host</span>
                          ) : null}
                        </button>
                      ))}
                    </div>
                    <button
                      className="btn btn--ghost team-switcher__new"
                      id="team-create-new"
                      type="button"
                      onClick={handleCreateTeam}
                    >
                      New team
                    </button>
                  </section>

                  {invites.length > 0 ? (
                    <TeamInvitations
                      invites={invites}
                      onAcceptInvite={handleAcceptInvite}
                      onDeclineInvite={onDeclineInvite}
                    />
                  ) : null}

                  <TeamOverview
                    teamName={activeTeamView.team.name}
                    members={activeTeamView.members}
                    tasks={state.tasks}
                    history={state.history}
                    now={now}
                    hostId={hostId}
                    currentUserId={user.id}
                    isHost={activeTeamView.isHost}
                    pendingInvites={activeTeamView.pendingInvites}
                    onInvite={handleInvite}
                    onCancelInvite={handleCancelInvite}
                    onRemoveMember={handleRemoveMember}
                    onDeleteTeam={handleDeleteTeam}
                  />
                </>
              ) : null}

              {showTasks ? (
                <TaskForm
                  key={
                    workspace === "team"
                      ? `team:${activeTeamId ?? ""}`
                      : "private"
                  }
                  now={now}
                  workspace={workspace}
                  members={members}
                  currentUserId={user.id}
                  onAdd={addTask}
                />
              ) : null}

              {showTasks ? (
                <section className="card" aria-labelledby="tasks-heading">
                  <div className="card__head">
                    <h2 className="card__title" id="tasks-heading">
                      {taskHeading}{" "}
                      <span className="pill" id="task-count" aria-live="polite">
                        {state.tasks.length}
                      </span>
                    </h2>
                    {workspace === "private" && state.tasks.length > 0 ? (
                      <button
                        className="btn btn--ghost"
                        type="button"
                        onClick={clearTasks}
                      >
                        Clear all
                      </button>
                    ) : null}
                  </div>

                  {state.tasks.length > 0 ? (
                    <TaskToolbar sort={sort} onSortChange={handleSortChange} />
                  ) : null}

                  {state.tasks.length === 0 ? (
                    <div className="empty">
                      <div className="empty__icon" aria-hidden="true">
                        {filter === "all" ? "🌱" : "🎉"}
                      </div>
                      <p className="empty__title">
                        {filter === "all"
                          ? workspace === "team"
                            ? "Nothing on the team plate"
                            : "Nothing on your plate"
                          : filteredEmpty.title}
                      </p>
                      <p className="empty__text">
                        {filter === "all"
                          ? workspace === "team"
                            ? "Add a shared task above to get started."
                            : "Add a task above to get started."
                          : filteredEmpty.text}
                      </p>
                    </div>
                  ) : visibleTasks.length === 0 ? (
                    <div className="empty empty--filtered">
                      <div className="empty__icon" aria-hidden="true">
                        {filter === "overdue" ? "✅" : "🎉"}
                      </div>
                      <p className="empty__title">{filteredEmpty.title}</p>
                      <p className="empty__text">{filteredEmpty.text}</p>
                      <button
                        className="link-btn"
                        type="button"
                        onClick={() => setFilter("all")}
                      >
                        Show all tasks
                      </button>
                    </div>
                  ) : (
                    <ul className="list" id="task-list">
                      {visibleTasks.map((task) => (
                        <TaskItem
                          key={task.id}
                          task={task}
                          now={now}
                          workspace={workspace}
                          members={members}
                          currentUserId={user.id}
                          isEntering={task.id === enteringTaskId}
                          isLeaving={leavingIds.includes(task.id)}
                          onComplete={completeTask}
                          onDelete={deleteTask}
                          onRename={renameTask}
                          onAssign={assignTask}
                          onProgressChange={changeTaskProgress}
                          onLogProgress={logTaskProgress}
                        />
                      ))}
                    </ul>
                  )}
                </section>
              ) : null}

              {showHistory ? (
                <section
                  className={`card${historyFlash ? " card--flash" : ""}`}
                  aria-labelledby="history-heading"
                >
                  <div className="card__head">
                    <h2 className="card__title" id="history-heading">
                      {filter === "completed" ? "Completed tasks" : "History"}{" "}
                      <span
                        className="pill pill--done"
                        id="history-count"
                        aria-live="polite"
                      >
                        {state.history.length}
                      </span>
                    </h2>
                    {workspace === "private" && state.history.length > 0 ? (
                      <button
                        className="btn btn--ghost"
                        type="button"
                        onClick={clearHistory}
                      >
                        Clear history
                      </button>
                    ) : null}
                  </div>

                  {state.history.length === 0 ? (
                    <div className="empty">
                      <div className="empty__icon" aria-hidden="true">
                        🏁
                      </div>
                      <p className="empty__title">No finished tasks yet</p>
                      <p className="empty__text">
                        Check off a task and it will show up here with its full
                        update history and an on-time or late flag.
                      </p>
                    </div>
                  ) : (
                    <ul className="list list--history" id="history-list">
                      {state.history.map((item) => (
                        <HistoryItem
                          key={item.id}
                          item={item}
                          now={now}
                          workspace={workspace}
                          members={members}
                          currentUserId={user.id}
                          isEntering={item.id === enteringHistoryId}
                          onRestore={restoreTask}
                          onDelete={deleteHistoryItem}
                          onRename={renameHistoryItem}
                        />
                      ))}
                    </ul>
                  )}
                </section>
              ) : null}
            </>
          )}
        </div>
      </div>

      <footer className="footer">
        {workspace === "team"
          ? activeTeamView
            ? "Team tasks sync live with accepted members on this Taskly server."
            : "Join or create a team to see shared tasks. Your private tasks stay private."
          : `Saved privately on the Taskly server for ${user.name}.`}
      </footer>
    </main>
  );
}
