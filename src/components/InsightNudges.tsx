import type { InsightNudge } from "../lib/insights";
import type { RecurrenceRule } from "../types";

type InsightNudgesProps = {
  nudges: InsightNudge[];
  candidates: RecurrenceRule[];
  enabledCount: number;
  busy: boolean;
  onDismiss: (id: string) => void;
  onEnable: (rule: RecurrenceRule) => void;
  onRun: () => void;
};

const CADENCE_LABEL: Record<RecurrenceRule["cadence"], string> = {
  daily: "every day",
  weekly: "every week",
  biweekly: "every two weeks",
  monthly: "every month",
};

export function InsightNudges({
  nudges,
  candidates,
  enabledCount,
  busy,
  onDismiss,
  onEnable,
  onRun,
}: InsightNudgesProps) {
  const hasContent =
    nudges.length > 0 || candidates.length > 0 || enabledCount > 0;
  if (!hasContent) return null;

  return (
    <section className="card card--insights" aria-labelledby="insights-heading">
      <div className="card__head">
        <h2 className="card__title" id="insights-heading">
          Gentle nudges
        </h2>
      </div>

      {nudges.length > 0 ? (
        <ul className="nudges" id="nudge-list">
          {nudges.map((nudge) => (
            <li className="nudge" key={nudge.id}>
              <span>{nudge.text}</span>
              <button
                className="nudge__dismiss"
                type="button"
                aria-label={`Dismiss: ${nudge.text}`}
                onClick={() => onDismiss(nudge.id)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {candidates.length > 0 ? (
        <ul className="nudges" id="recurring-candidates">
          {candidates.slice(0, 3).map((rule, index) => (
            <li className="nudge nudge--rule" key={`${rule.titleKey}-${index}`}>
              <span>
                “{rule.title}” looks like repeating work {CADENCE_LABEL[rule.cadence]}.
              </span>
              <button
                className="btn btn--ghost"
                id={`recurring-enable-${index}`}
                type="button"
                onClick={() => onEnable(rule)}
              >
                Track it
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="insights__actions">
        <button
          className="btn btn--ghost"
          id="recurring-run"
          type="button"
          disabled={busy || enabledCount === 0}
          onClick={onRun}
        >
          {busy ? "Creating…" : "Create due recurring tasks"}
        </button>
        {enabledCount === 0 ? (
          <span className="checkin__hint">
            Enable a repeating task above to turn this on.
          </span>
        ) : null}
      </div>
    </section>
  );
}
