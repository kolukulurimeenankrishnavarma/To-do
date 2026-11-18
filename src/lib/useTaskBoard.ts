import { useEffect, useMemo, useRef, useState } from "react";
import { savePrivateState, saveTeamState } from "./api";
import { taskId } from "./id";
import { appendProgressEntry, clampProgress } from "./progress";
import { canManage } from "./taskPermissions";
import { emptyState } from "./storage";
import { readStoredSort, rememberSort } from "./sortPreference";
import { readTabTeamId, rememberTeamId } from "./tabState";
import { useTransientFlag } from "./useTransientFlag";
import {
  completionEntry,
  filterTasks,
  isOverdue,
  isPending,
  sortTasks,
  taskStats,
} from "./tasks";
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

export type TaskBoardOptions = {
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
};

export function useTaskBoard({
  user,
  initialState,
  teams,
  invites,
  focusInviteId = null,
  onCreateTeam,
  onInvite,
  onAcceptInvite,
  onCancelInvite,
  onRemoveTeamMember,
  onDeleteTeam,
  onLogout,
}: TaskBoardOptions) {
function initialTeamId(teams: TeamView[]): string | null {
  const remembered = readTabTeamId();
  if (remembered && teams.some((view) => view.team.id === remembered)) {
    return remembered;
  }
  return teams[0]?.team.id ?? null;
}

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

  function changeFilter(next: TaskFilter) {
    setFilter(next);
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
    if (!canManage(workspace, task, user.id)) return;

    updateState((prev) => ({
      ...prev,
      tasks: prev.tasks.map((task) =>
        task.id === id ? { ...task, title } : task,
      ),
    }));
  }

  function renameHistoryItem(id: string, title: string) {
    const item = state.history.find((entry) => entry.id === id);
    if (!canManage(workspace, item, user.id, { allowUnassigned: true })) return;

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
        if (!canManage(workspace, task, user.id, { allowUnassigned: true })) {
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
        const canEditProgress = canManage(workspace, task, user.id, {
          allowUnassigned: true,
        });
        if (canEditProgress && task.progress === 0) return task;

        return appendProgressEntry(task, task.progress, Date.now(), note, user.id);
      }),
    }));
  }

  function completeTask(id: string) {
    if (pendingCompletions.current.has(id)) return;

    const task = state.tasks.find((item) => item.id === id);
    if (!canManage(workspace, task, user.id, { allowUnassigned: true })) return;

    pendingCompletions.current.add(id);
    setLeavingIds((prev) => [...prev, id]);

    window.setTimeout(() => {
      pendingCompletions.current.delete(id);

      updateState((prev) => {
        const current = prev.tasks.find((item) => item.id === id);
        if (!current) return prev;
        if (!canManage(workspace, current, user.id, { allowUnassigned: true })) {
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
    if (!canManage(workspace, task, user.id)) return;

    updateState((prev) => ({
      ...prev,
      tasks: prev.tasks.filter((task) => task.id !== id),
    }));
  }

  function restoreTask(id: string) {
    const completed = state.history.find((entry) => entry.id === id);
    if (!canManage(workspace, completed, user.id, { allowUnassigned: true })) {
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
    if (!canManage(workspace, item, user.id, { allowUnassigned: true })) return;

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

  return {
    activeTeamId,
    workspace,
    filter,
    sort,
    now,
    leavingIds,
    enteringTaskId,
    enteringHistoryId,
    historyFlash,
    activeTeamView,
    activeTeam,
    state,
    members,
    hostId,
    switchWorkspace,
    selectTeam,
    handleSortChange,
    changeFilter,
    handleCreateTeam,
    handleAcceptInvite,
    handleInvite,
    handleCancelInvite,
    handleRemoveMember,
    handleDeleteTeam,
    addTask,
    renameTask,
    renameHistoryItem,
    assignTask,
    changeTaskProgress,
    logTaskProgress,
    completeTask,
    deleteTask,
    restoreTask,
    deleteHistoryItem,
    clearTasks,
    clearHistory,
    handleLogout,
    counts,
    visibleTasks,
    stats,
  };
}
