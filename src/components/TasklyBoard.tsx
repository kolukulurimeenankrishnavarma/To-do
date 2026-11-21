import { CheckInCard } from "./CheckInCard";
import { EmptyState } from "./EmptyState";
import { HistoryItem } from "./HistoryItem";
import { InsightNudges } from "./InsightNudges";
import { StatsBar } from "./StatsBar";
import { TaskForm } from "./TaskForm";
import { TaskItem } from "./TaskItem";
import { TaskToolbar } from "./TaskToolbar";
import { TeamGate, TeamInvitations } from "./TeamGate";
import { TeamOverview } from "./TeamOverview";
import { ThemeToggle } from "./ThemeToggle";
import { UserIcon } from "./Icons";
import { formatToday } from "../lib/date";
import type { Theme } from "../lib/theme";
import { useTaskBoard, type TaskBoardOptions } from "../lib/useTaskBoard";
import type { TaskFilter, TeamActionResult } from "../types";

type TasklyBoardProps = TaskBoardOptions & {
  onDeclineInvite: (
    teamId: string,
    inviteId: string,
  ) => Promise<TeamActionResult>;
  theme: Theme;
  onToggleTheme: () => void;
};

const VIEWS: { id: TaskFilter; label: string }[] = [
  { id: "all", label: "All tasks" },
  { id: "pending", label: "Pending" },
  { id: "overdue", label: "Overdue" },
  { id: "completed", label: "Completed" },
];

const SORT_LABELS = {
  newest: "Newest first",
  deadline: "Deadline soonest",
  "progress-desc": "Progress high to low",
  "progress-asc": "Progress low to high",
  title: "Title A–Z",
} as const;

export function TasklyBoard({
  user,
  initialState,
  initialInsights,
  teams,
  invites,
  focusInviteId = null,
  onCreateTeam,
  onInvite,
  onAcceptInvite,
  onDeclineInvite,
  onCancelInvite,
  onRemoveTeamMember,
  onDeleteTeam,
  onRunRecurring,
  onLogout,
  theme,
  onToggleTheme,
}: TasklyBoardProps) {
  const board = useTaskBoard({
    user,
    initialState,
    initialInsights,
    teams,
    invites,
    focusInviteId,
    onCreateTeam,
    onInvite,
    onAcceptInvite,
    onCancelInvite,
    onRemoveTeamMember,
    onDeleteTeam,
    onRunRecurring,
    onLogout,
  });
  const {
    activeTeamId,
    workspace,
    filter,
    sort,
    bestFitActive,
    insights,
    nudges,
    recurrenceCandidates,
    recurringBusy,
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
    handleSaveCheckIn,
    handleClearBestFit,
    handleDismissNudge,
    handleEnableRecurring,
    handleRunRecurring,
    handleLogout,
    counts,
    visibleTasks,
    stats,
  } = board;

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
                onClick={() => changeFilter(view.id)}
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

          <CheckInCard checkIn={insights.checkIn} onSave={handleSaveCheckIn} />

          <InsightNudges
            nudges={nudges}
            candidates={recurrenceCandidates}
            enabledCount={insights.recurringRules.filter((rule) => rule.enabled).length}
            busy={recurringBusy}
            onDismiss={handleDismissNudge}
            onEnable={handleEnableRecurring}
            onRun={() => void handleRunRecurring()}
          />

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
                  history={state.history}
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
                    <TaskToolbar
                      sort={sort}
                      onSortChange={handleSortChange}
                      bestFitActive={bestFitActive}
                      onClearBestFit={handleClearBestFit}
                      savedSortLabel={SORT_LABELS[sort]}
                    />
                  ) : null}

                  {state.tasks.length === 0 ? (
                    <EmptyState
                      icon={filter === "all" ? "🌱" : "🎉"}
                      title={
                        filter === "all"
                          ? workspace === "team"
                            ? "Nothing on the team plate"
                            : "Nothing on your plate"
                          : filteredEmpty.title
                      }
                      text={
                        filter === "all"
                          ? workspace === "team"
                            ? "Add a shared task above to get started."
                            : "Add a task above to get started."
                          : filteredEmpty.text
                      }
                    />
                  ) : visibleTasks.length === 0 ? (
                    <EmptyState
                      filtered
                      icon={filter === "overdue" ? "✅" : "🎉"}
                      title={filteredEmpty.title}
                      text={filteredEmpty.text}
                      actionLabel="Show all tasks"
                      onAction={() => changeFilter("all")}
                    />
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
                    <EmptyState
                      icon="🏁"
                      title="No finished tasks yet"
                      text="Check off a task and it will show up here with its full update history and an on-time or late flag."
                    />
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
