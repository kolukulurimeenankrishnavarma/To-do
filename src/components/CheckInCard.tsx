import { useState, type FormEvent } from "react";
import type { CheckIn } from "../types";

type CheckInCardProps = {
  checkIn: CheckIn | null;
  onSave: (checkIn: CheckIn) => void;
};

const TIME_WINDOWS = [15, 30, 60, 120, 240];
const SCALE = [1, 2, 3, 4, 5];

function labelFor(value: number): string {
  return ["", "Very low", "Low", "Steady", "Good", "High"][value] ?? "Steady";
}

export function CheckInCard({ checkIn, onSave }: CheckInCardProps) {
  const [energy, setEnergy] = useState(checkIn?.energy ?? 3);
  const [mood, setMood] = useState(checkIn?.mood ?? 3);
  const [focus, setFocus] = useState(checkIn?.focus ?? 3);
  const [timeWindow, setTimeWindow] = useState(checkIn?.timeWindow ?? 30);
  const [goal, setGoal] = useState(checkIn?.goal ?? "");
  const [blockers, setBlockers] = useState(checkIn?.blockers ?? "");
  const [showBlockers, setShowBlockers] = useState(Boolean(checkIn?.blockers));

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave({
      energy,
      mood,
      focus,
      timeWindow,
      goal: goal.trim(),
      blockers: blockers.trim(),
      createdAt: Date.now(),
    });
  }

  return (
    <section className="card card--checkin" aria-labelledby="checkin-heading">
      <div className="card__head">
        <h2 className="card__title" id="checkin-heading">
          How are you working right now?
        </h2>
        {checkIn ? (
          <span className="pill">Saved</span>
        ) : (
          <span className="pill pill--soft">Optional</span>
        )}
      </div>
      <form className="checkin" onSubmit={handleSubmit}>
        <div className="checkin__grid">
          {(
            [
              ["energy", "Energy", energy, setEnergy],
              ["mood", "Mood", mood, setMood],
              ["focus", "Focus", focus, setFocus],
            ] as const
          ).map(([id, label, value, setValue]) => (
            <fieldset className="checkin__field" key={id}>
              <legend>{label}</legend>
              <div className="checkin__scale">
                {SCALE.map((step) => (
                  <label key={step} className="checkin__step">
                    <input
                      id={`checkin-${id}-${step}`}
                      type="radio"
                      name={`checkin-${id}`}
                      value={step}
                      checked={value === step}
                      onChange={() => setValue(step)}
                    />
                    <span aria-hidden="true">{step}</span>
                    <span className="sr-only">{labelFor(step)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}

          <label className="checkin__field checkin__field--wide">
            <span>Time available</span>
            <select
              id="checkin-time"
              value={timeWindow}
              onChange={(event) => setTimeWindow(Number(event.target.value))}
            >
              {TIME_WINDOWS.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes < 60 ? `${minutes} minutes` : `${minutes / 60} hour${
                    minutes === 60 ? "" : "s"
                  }`}
                </option>
              ))}
            </select>
          </label>

          <label className="checkin__field checkin__field--wide">
            <span>What do you want to get done?</span>
            <input
              id="checkin-goal"
              type="text"
              maxLength={120}
              value={goal}
              placeholder="e.g. finish the API migration"
              onChange={(event) => setGoal(event.target.value)}
            />
          </label>
        </div>

        <button
          className="checkin__more"
          id="checkin-more"
          type="button"
          aria-expanded={showBlockers}
          onClick={() => setShowBlockers((current) => !current)}
        >
          {showBlockers ? "Hide blockers" : "Add blockers (optional)"}
        </button>
        {showBlockers ? (
          <label className="checkin__field checkin__field--wide">
            <span>Anything in the way?</span>
            <input
              id="checkin-blockers"
              type="text"
              maxLength={280}
              value={blockers}
              placeholder="e.g. waiting on client feedback"
              onChange={(event) => setBlockers(event.target.value)}
            />
          </label>
        ) : null}

        <div className="checkin__actions">
          <button className="btn btn--primary" id="checkin-save" type="submit">
            Save check-in
          </button>
          <span className="checkin__hint">
            Your answers stay private. Saved sort is never changed.
          </span>
        </div>
      </form>
    </section>
  );
}
