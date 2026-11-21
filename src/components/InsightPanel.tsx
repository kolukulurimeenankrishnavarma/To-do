import type {
  PersonalBaseline,
  RepeatedTaskPattern,
  TaskSuggestion,
  TaskSuggestions,
} from "../lib/insights";
import type { CheckIn } from "../types";

type InsightPanelProps = {
  baseline: PersonalBaseline;
  checkIn: CheckIn | null;
  suggestions: TaskSuggestions;
  patterns: RepeatedTaskPattern[];
  nudge: string | null;
  error: string;
  bestFitAvailable: boolean;
  bestFit: boolean;
  onToggleBestFit: () => void;
  onShowTask: (taskId: string) => void;
};

function dayLabel(count: number): string {
  return count === 1 ? "day" : "days";
}

function SuggestionList({
  title,
  items,
  onShowTask,
}: {
  title: string;
  items: TaskSuggestion[];
  onShowTask: (taskId: string) => void;
}) {
  if (items.length === 0) return null;

  return (
    <div className="insight-panel__group">
      <h3 className="insight-panel__subtitle">{title}</h3>
      <ul className="insight-list">
        {items.map((item) => (
          <li className="insight-list__item" key={item.taskId}>
            <div className="insight-list__text">
              <strong className="insight-list__title">{item.title}</strong>
              <span className="insight-list__reason">{item.reason}</span>
            </div>
            <button
              className="btn btn--ghost insight-list__show"
              type="button"
              aria-label={`Show ${item.title} in the task list`}
              onClick={() => onShowTask(item.taskId)}
            >
              Show
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Private-only summary of the rule engine. Never rendered for team work. */
export function InsightPanel({
  baseline,
  checkIn,
  suggestions,
  patterns,
  nudge,
  error,
  bestFitAvailable,
  bestFit,
  onToggleBestFit,
  onShowTask,
}: InsightPanelProps) {
  return (
    <section className="card insight-panel" id="insight-panel" aria-labelledby="insight-title">
      <div className="card__head">
        <h2 className="card__title" id="insight-title">
          Daily insight <span className="pill">Private</span>
        </h2>
        {baseline.ready ? (
          <span className="insight-panel__streak">Streak {baseline.dailyStreak}</span>
        ) : null}
      </div>

      {error ? (
        <p className="form-error" id="insight-error" role="alert">
          {error}
        </p>
      ) : null}

      {baseline.ready ? (
        <p className="insight-panel__summary">
          Based on your first 7 active days, you finish about{" "}
          <strong>{baseline.dailyStreak} tasks a day</strong>. That is your streak —
          a guide, never a limit.
        </p>
      ) : (
        <div className="insight-panel__learning">
          <p className="insight-panel__summary">
            Learning your rhythm: <strong>{baseline.dayCount} of 7</strong> active
            days observed. Recommendations unlock after your seventh active day.
          </p>
          <div
            className="insight-panel__bar"
            role="progressbar"
            aria-label="Baseline progress"
            aria-valuemin={0}
            aria-valuemax={7}
            aria-valuenow={Math.min(baseline.dayCount, 7)}
          >
            <span style={{ width: `${Math.min(100, (baseline.dayCount / 7) * 100)}%` }} />
          </div>
        </div>
      )}

      {nudge ? (
        <p className="insight-panel__nudge" id="insight-nudge" role="status">
          {nudge}
        </p>
      ) : null}

      {checkIn ? (
        <>
          <p className="insight-panel__mood">
            Today: mood {checkIn.mood}/5 · energy {checkIn.energy}/5 ·{" "}
            {checkIn.timeWindow} minutes available
          </p>
          <SuggestionList
            title="Good fits for right now"
            items={suggestions.fit}
            onShowTask={onShowTask}
          />
          <SuggestionList
            title="Quick wins that may lift your mood"
            items={suggestions.boost}
            onShowTask={onShowTask}
          />
        </>
      ) : (
        <p className="insight-panel__hint">
          Complete today's check-in to see which tasks fit your mood, energy, and
          available time.
        </p>
      )}

      {baseline.ready && patterns.length > 0 ? (
        <div className="insight-panel__group">
          <h3 className="insight-panel__subtitle">Repeated task deadlines</h3>
          <ul className="insight-list insight-list--deadlines">
            {patterns.map((pattern) => (
              <li className="insight-list__item" key={pattern.key}>
                <div className="insight-list__text">
                  <strong className="insight-list__title">{pattern.title}</strong>
                  <span className="insight-list__reason">
                    {pattern.count} finished · usually {pattern.medianDays}{" "}
                    {dayLabel(pattern.medianDays)}
                  </span>
                </div>
                <span className="insight-list__badge">
                  Try {pattern.recommendedDays} {dayLabel(pattern.recommendedDays)}
                </span>
              </li>
            ))}
          </ul>
          <p className="insight-panel__fineprint">
            Advisory only — Taskly never changes a deadline for you.
          </p>
        </div>
      ) : null}

      {bestFitAvailable ? (
        <div className="insight-panel__bestfit">
          <p className="insight-panel__fineprint">
            {bestFit
              ? "Tasks are in best-fit order. Your saved sort is unchanged."
              : "Reorder today's list to match your check-in."}
          </p>
          <button
            className={`btn ${bestFit ? "btn--primary" : "btn--ghost"}`}
            type="button"
            id="best-fit-toggle-panel"
            aria-pressed={bestFit}
            onClick={onToggleBestFit}
          >
            {bestFit ? "Back to saved sort" : "Use best-fit order"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
