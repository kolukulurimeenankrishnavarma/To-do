import { useRef, useState, type FormEvent } from "react";
import { MAX_TITLE_LENGTH } from "../lib/constants";
import {
  combineDateAndTime,
  dateInputValue,
  defaultDeadlineDate,
  presetDeadline,
  timeInputValue,
} from "../lib/date";
import { recommendedDeadlineAdvice, type RepeatedTaskPattern } from "../lib/insights";
import { useTransientFlag } from "../lib/useTransientFlag";
import type { PublicUser, Workspace } from "../types";
import { DeadlinePicker } from "./DeadlinePicker";

type TaskFormProps = {
  now: number;
  workspace: Workspace;
  members: PublicUser[];
  currentUserId: string;
  nudge?: string | null;
  deadlinePatterns?: RepeatedTaskPattern[];
  onAdd: (
    title: string,
    deadline: number | null,
    assigneeId: string | null,
  ) => void;
};

export function TaskForm({
  now,
  workspace,
  members,
  currentUserId,
  nudge = null,
  deadlinePatterns = [],
  onAdd,
}: TaskFormProps) {
  const [title, setTitle] = useState("");
  const [draftDeadline, setDraftDeadline] = useState<number | null>(null);
  const [assigneeId, setAssigneeId] = useState<string | null>(
    workspace === "team" ? currentUserId : null,
  );
  const [panelOpen, setPanelOpen] = useState(false);
  const [dateValue, setDateValue] = useState("");
  const [timeValue, setTimeValue] = useState("");
  const [error, setError] = useState("");
  const [shake, triggerShake] = useTransientFlag(340);

  const inputRef = useRef<HTMLInputElement>(null);
  const deadlineAdvice =
    workspace === "private"
      ? recommendedDeadlineAdvice(title.trim(), deadlinePatterns)
      : null;

  function showError(message: string) {
    setError(message);
    triggerShake();
  }

  function togglePicker() {
    if (panelOpen) {
      setPanelOpen(false);
      return;
    }

    const initial =
      draftDeadline !== null ? draftDeadline : defaultDeadlineDate().getTime();
    setDateValue(dateInputValue(initial));
    setTimeValue(timeInputValue(initial));
    setPanelOpen(true);
  }

  function saveDeadline() {
    const timestamp = combineDateAndTime(dateValue, timeValue);
    if (timestamp === null) return;

    setDraftDeadline(timestamp);
    setPanelOpen(false);
  }

  function cancelPicker() {
    setPanelOpen(false);
  }

  function clearDeadline() {
    setDraftDeadline(null);
    setPanelOpen(false);
  }

  function applyPreset(daysAhead: number) {
    const timestamp = presetDeadline(daysAhead);
    setDateValue(dateInputValue(timestamp));
    setTimeValue(timeInputValue(timestamp));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = title.trim();
    if (!trimmed) {
      showError("Give your task a name first.");
      inputRef.current?.focus();
      return;
    }

    let deadline = draftDeadline;
    if (panelOpen) {
      const picked = combineDateAndTime(dateValue, timeValue);
      if (picked !== null) deadline = picked;
    }

    onAdd(trimmed, deadline, workspace === "team" ? assigneeId : null);
    setTitle("");
    setDraftDeadline(null);
    setPanelOpen(false);
    setError("");
    inputRef.current?.focus();
  }

  return (
    <section className="card card--form" aria-label="Add a task">
      <form
        className={`task-form${workspace === "team" ? " task-form--team" : ""}${
          shake ? " task-form--shake" : ""
        }`}
        id="task-form"
        autoComplete="off"
        onSubmit={handleSubmit}
      >
        <input
          ref={inputRef}
          className="task-form__input"
          id="task-input"
          type="text"
          maxLength={MAX_TITLE_LENGTH}
          placeholder={
            workspace === "team"
              ? "What should the team get done?"
              : "What needs to get done?"
          }
          aria-label="New task"
          aria-describedby="form-error"
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            if (error) setError("");
          }}
        />

        <DeadlinePicker
          value={draftDeadline}
          open={panelOpen}
          dateValue={dateValue}
          timeValue={timeValue}
          now={now}
          onToggle={togglePicker}
          onDateChange={setDateValue}
          onTimeChange={setTimeValue}
          onPreset={applyPreset}
          onSave={saveDeadline}
          onCancel={cancelPicker}
          onClear={clearDeadline}
        />

        {workspace === "team" ? (
          <label className="task-form__assignee">
            <span>Assign to</span>
            <select
              id="task-assignee"
              value={assigneeId ?? ""}
              onChange={(event) => setAssigneeId(event.target.value || null)}
            >
              <option value="">Unassigned</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <button className="btn btn--primary" type="submit">
          Add task
        </button>
      </form>

      {error ? (
        <p className="form-error" id="form-error" role="alert">
          {error}
        </p>
      ) : null}

      {nudge ? (
        <p className="insight-nudge" id="task-add-nudge" role="status">
          {nudge}
        </p>
      ) : null}

      {deadlineAdvice ? (
        <p className="insight-advice" id="deadline-advice" role="status">
          {deadlineAdvice} Your deadline stays your choice.
        </p>
      ) : null}
    </section>
  );
}
