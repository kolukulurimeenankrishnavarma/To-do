import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  combineDateAndTime,
  friendlyDeadline,
  fullDeadlineLabel,
} from "../lib/date";
import { usePopoverPlacement } from "../lib/popoverPlacement";
import { CalendarIcon, ChevronIcon, XIcon } from "./Icons";

type DeadlinePickerProps = {
  value: number | null;
  open: boolean;
  dateValue: string;
  timeValue: string;
  now: number;
  onToggle: () => void;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
  onPreset: (daysAhead: number) => void;
  onSave: () => void;
  onCancel: () => void;
  onClear: () => void;
};

const PRESETS = [
  { days: 0, label: "Today" },
  { days: 1, label: "Tomorrow" },
  { days: 7, label: "Next week" },
];

export function DeadlinePicker({
  value,
  open,
  dateValue,
  timeValue,
  now,
  onToggle,
  onDateChange,
  onTimeChange,
  onPreset,
  onSave,
  onCancel,
  onClear,
}: DeadlinePickerProps) {
  const builderRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const timeRef = useRef<HTMLInputElement>(null);
  const flashTimer = useRef<number | undefined>(undefined);
  const [flash, setFlash] = useState(false);
  const { side, maxHeight } = usePopoverPlacement(open, builderRef, 340);

  const preview = combineDateAndTime(dateValue, timeValue);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: globalThis.PointerEvent) {
      const target = event.target as Element | null;
      if (!target) return;
      if (builderRef.current?.contains(target)) return;
      if (target.closest('#task-form button[type="submit"]')) return;
      onCancel();
    }

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [open, onCancel]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => dateRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    return () => {
      if (flashTimer.current !== undefined) {
        window.clearTimeout(flashTimer.current);
      }
    };
  }, []);

  function flashTrigger() {
    setFlash(false);
    window.requestAnimationFrame(() => setFlash(true));

    if (flashTimer.current !== undefined) {
      window.clearTimeout(flashTimer.current);
    }
    flashTimer.current = window.setTimeout(() => setFlash(false), 750);
  }

  function handleSave() {
    if (preview === null) return;
    onSave();
    flashTrigger();
    triggerRef.current?.focus();
  }

  function handleCancel() {
    onCancel();
    triggerRef.current?.focus();
  }

  function handleClear() {
    onClear();
    triggerRef.current?.focus();
  }

  function handlePreset(daysAhead: number) {
    onPreset(daysAhead);
    timeRef.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      handleCancel();
      return;
    }

    if (
      event.key === "Enter" &&
      (event.target === dateRef.current || event.target === timeRef.current)
    ) {
      event.preventDefault();
      handleSave();
    }
  }

  const label = value !== null ? friendlyDeadline(value, now) : "Add a deadline";
  const triggerTitle =
    value !== null
      ? `Due ${fullDeadlineLabel(value)}. Click to change.`
      : "Choose a deadline";

  return (
    <div className="deadline-builder" ref={builderRef}>
      <div className="deadline-controls">
        <button
          ref={triggerRef}
          type="button"
          id="deadline-trigger"
          className={`deadline-trigger${value !== null ? " deadline-trigger--set" : ""}${
            flash ? " deadline-trigger--saved" : ""
          }`}
          aria-expanded={open}
          aria-controls="deadline-panel"
          title={triggerTitle}
          onClick={onToggle}
        >
          <CalendarIcon className="deadline-trigger__icon" />
          <span className="deadline-trigger__label">{label}</span>
          <ChevronIcon className="deadline-trigger__chevron" />
        </button>
        <button
          type="button"
          className="deadline-clear"
          id="deadline-clear"
          aria-label="Clear deadline"
          title="Clear deadline"
          hidden={value === null}
          onClick={handleClear}
        >
          <XIcon />
        </button>
      </div>

      {open ? (
        <div
          className={`deadline-panel${side === "up" ? " deadline-panel--up" : ""}`}
          id="deadline-panel"
          style={{ maxHeight }}
          role="group"
          aria-label="Choose a deadline"
          onKeyDown={handleKeyDown}
        >
          <div className="deadline-presets" role="group" aria-label="Quick presets">
            {PRESETS.map((preset) => (
              <button
                key={preset.days}
                className="chip"
                type="button"
                data-preset={preset.days}
                onClick={() => handlePreset(preset.days)}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="deadline-fields">
            <label className="deadline-input">
              <span>Date</span>
              <input
                ref={dateRef}
                id="deadline-date"
                type="date"
                value={dateValue}
                onChange={(event) => onDateChange(event.target.value)}
              />
            </label>
            <label className="deadline-input">
              <span>Time</span>
              <input
                ref={timeRef}
                id="deadline-time"
                type="time"
                step="900"
                value={timeValue}
                onChange={(event) => onTimeChange(event.target.value)}
              />
            </label>
          </div>

          <p
            id="deadline-preview"
            className={`deadline-preview${
              preview === null
                ? " deadline-preview--invalid"
                : " deadline-preview--valid"
            }`}
            aria-live="polite"
          >
            {preview === null
              ? "Pick a date and time to save this deadline."
              : `Due ${fullDeadlineLabel(preview)}`}
          </p>

          <div className="deadline-panel__actions">
            <button className="btn btn--ghost" id="deadline-cancel" type="button" onClick={handleCancel}>
              Cancel
            </button>
            <button
              className="btn btn--save"
              id="deadline-save"
              type="button"
              disabled={preview === null}
              onClick={handleSave}
            >
              Save deadline
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
