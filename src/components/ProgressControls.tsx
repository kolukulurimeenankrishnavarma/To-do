import { useEffect, useRef, useState, type CSSProperties } from "react";
import { MAX_NOTE_LENGTH, PROGRESS_STEP } from "../lib/constants";
import type { Task } from "../types";

type ProgressControlsProps = {
  task: Task;
  canEditProgress: boolean;
  lockedReason?: string;
  onProgressChange: (value: number) => void;
  onLog: (note: string) => void;
};

export function ProgressControls({
  task,
  canEditProgress,
  lockedReason,
  onProgressChange,
  onLog,
}: ProgressControlsProps) {
  const [note, setNote] = useState("");
  const [logged, setLogged] = useState(false);
  const feedbackTimer = useRef<number | undefined>(undefined);
  const needsProgress = canEditProgress && task.progress === 0;

  useEffect(() => {
    return () => {
      if (feedbackTimer.current !== undefined) {
        window.clearTimeout(feedbackTimer.current);
      }
    };
  }, []);

  function logProgress() {
    // A progress update at 0% records no change and only clutters the log.
    // Teammates who cannot edit progress may still add comments.
    if (needsProgress) return;

    onLog(note);
    setNote("");
    setLogged(true);

    if (feedbackTimer.current !== undefined) {
      window.clearTimeout(feedbackTimer.current);
    }
    feedbackTimer.current = window.setTimeout(() => setLogged(false), 1200);
  }

  const sliderStyle = {
    "--progress": `${task.progress}%`,
  } as CSSProperties;

  return (
    <>
      <div
        className={`progress${task.progress === 100 ? " progress--complete" : ""}${
          canEditProgress ? "" : " progress--locked"
        }`}
      >
        <input
          type="range"
          className="progress__slider"
          min="0"
          max="100"
          step={PROGRESS_STEP}
          value={task.progress}
          style={sliderStyle}
          aria-label={`Progress for "${task.title}"`}
          aria-valuetext={`${task.progress}% complete`}
          title={
            canEditProgress
              ? undefined
              : lockedReason ?? "You can only add comments to this task."
          }
          disabled={!canEditProgress}
          onChange={(event) => onProgressChange(Number(event.target.value))}
        />
        <span className="progress__value" aria-hidden="true">
          {task.progress}%
        </span>
      </div>

      <div className="progress-note-row">
        <input
          type="text"
          className="progress-note"
          data-action="progress-note"
          value={note}
          maxLength={MAX_NOTE_LENGTH}
          placeholder={
            needsProgress
              ? "Move the slider above 0% to log an update"
              : canEditProgress
                ? "Add a note for this update (optional)"
                : "Add a comment for the team (optional)"
          }
          title={
            needsProgress
              ? "Progress must be above 0% to log an update."
              : undefined
          }
          aria-label={
            needsProgress
              ? `Progress must be above 0% to log an update on "${task.title}"`
              : canEditProgress
                ? `Note for the next progress update on "${task.title}"`
                : `Comment on "${task.title}"`
          }
          onChange={(event) => setNote(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              logProgress();
            }
          }}
        />
        <button
          type="button"
          className={`btn btn--log${logged ? " btn--log--logged" : ""}`}
          data-action="log-progress"
          disabled={needsProgress}
          title={
            needsProgress
              ? "Progress must be above 0% to log an update."
              : undefined
          }
          aria-label={
            needsProgress
              ? `Progress must be above 0% to log an update on "${task.title}"`
              : canEditProgress
                ? `Log progress for "${task.title}"`
                : `Add comment to "${task.title}"`
          }
          onClick={logProgress}
        >
          {logged ? "Logged" : canEditProgress ? "Log progress" : "Add comment"}
        </button>
      </div>
    </>
  );
}
