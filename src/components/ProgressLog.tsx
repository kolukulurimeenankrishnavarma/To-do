import { progressSummary, relativeTime, fullTimestamp } from "../lib/date";
import type { Task } from "../types";

type ProgressLogProps = {
  task: Task;
  open: boolean;
  now: number;
  onOpenChange: (open: boolean) => void;
};

export function ProgressLog({
  task,
  open,
  now,
  onOpenChange,
}: ProgressLogProps) {
  const log = task.progressLog;
  if (log.length === 0) return <div className="log-wrap" />;

  const latest = log[log.length - 1];

  return (
    <div className="log-wrap">
      <details
        className="log"
        open={open}
        onToggle={(event) => onOpenChange(event.currentTarget.open)}
      >
        <summary>
          <span>{progressSummary(log.length, latest.at, now)}</span>
        </summary>
        <ol className="log__list">
          {[...log].reverse().map((entry, index) => (
            <li key={`${entry.at}-${index}`} className="log__item">
              <span className="log__dot" aria-hidden="true" />
              <div className="log__content">
                <div className="log__row">
                  <span className="log__value">{entry.value}%</span>
                  <time
                    className="log__time"
                    dateTime={new Date(entry.at).toISOString()}
                    title={`Updated ${relativeTime(entry.at, now)}`}
                  >
                    {fullTimestamp(entry.at)}
                  </time>
                </div>
                {entry.note ? <p className="log__note">{entry.note}</p> : null}
              </div>
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}
