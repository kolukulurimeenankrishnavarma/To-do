import type { TaskStats } from "../lib/tasks";

type StatsBarProps = {
  stats: TaskStats;
};

export function StatsBar({ stats }: StatsBarProps) {
  return (
    <section className="stats" aria-label="Task summary">
      <div className="stat">
        <div className="stat__value">{stats.pending}</div>
        <div className="stat__label">Pending</div>
      </div>
      <div className="stat stat--overdue">
        <div className="stat__value">{stats.overdue}</div>
        <div className="stat__label">Overdue</div>
      </div>
      <div className="stat stat--done">
        <div className="stat__value">{stats.completed}</div>
        <div className="stat__label">Completed</div>
      </div>
    </section>
  );
}
