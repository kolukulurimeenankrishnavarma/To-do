import { useState } from "react";
import {
  buildCheckIn,
  MOOD_QUESTIONS_PER_DAY,
  questionsForDay,
} from "../lib/insights";
import type { CheckIn, MoodAnswer, Result } from "../types";

type DailyCheckInProps = {
  day: string;
  onSave: (checkIn: CheckIn) => Promise<Result>;
  onSkip: () => Promise<Result>;
};

const MOOD_LABELS = [
  "Not at all",
  "A little",
  "Somewhat",
  "Mostly",
  "Very much",
];
const ENERGY_LABELS = ["Drained", "Low", "Steady", "Good", "Energized"];
const TIME_OPTIONS = [15, 30, 60, 120];

export function DailyCheckIn({ day, onSave, onSkip }: DailyCheckInProps) {
  const questions = questionsForDay(day);
  const energyStep = questions.length;
  const timeStep = questions.length + 1;
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [energy, setEnergy] = useState<number | null>(null);
  const [timeWindow, setTimeWindow] = useState(30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const moodAnswers: MoodAnswer[] = questions.map((question) => ({
    id: question.id,
    prompt: question.prompt,
    value: answers[question.id] ?? 3,
  }));

  function goNext() {
    if (step < timeStep) {
      setStep((current) => current + 1);
      setError("");
    }
  }

  function goBack() {
    if (step > 0) {
      setStep((current) => current - 1);
      setError("");
    }
  }

  async function handleFinish() {
    setBusy(true);
    setError("");
    const result = await onSave(buildCheckIn(day, energy ?? 3, timeWindow, moodAnswers));
    if (!result.ok) {
      setError(result.error);
      setBusy(false);
    }
  }

  async function handleSkip() {
    setBusy(true);
    setError("");
    const result = await onSkip();
    if (!result.ok) {
      setError(result.error);
      setBusy(false);
    }
  }

  const prompt =
    step < questions.length
      ? questions[step].prompt
      : step === energyStep
        ? "How much energy do you have right now?"
        : "How much time can you give tasks today?";

  return (
    <section className="card checkin" id="daily-checkin" aria-labelledby="checkin-title">
      <div className="card__head">
        <h2 className="card__title" id="checkin-title">
          Daily check-in <span className="pill">Private</span>
        </h2>
        <button
          className="btn btn--ghost"
          type="button"
          id="checkin-skip"
          disabled={busy}
          onClick={() => void handleSkip()}
        >
          Skip for today
        </button>
      </div>

      <p className="checkin__intro">
        One question at a time. Your answers stay private and help Taskly suggest
        tasks that fit today.
      </p>

      <div className="checkin__progress" aria-hidden="true">
        {Array.from({ length: timeStep + 1 }, (_, index) => (
          <span
            key={index}
            className={`checkin__dot${index <= step ? " checkin__dot--done" : ""}`}
          />
        ))}
      </div>

      <p className="checkin__step" id="checkin-step">
        {step < questions.length
          ? `Question ${step + 1} of ${MOOD_QUESTIONS_PER_DAY}`
          : step === energyStep
            ? "Energy"
            : "Time available"}
      </p>
      <p className="checkin__prompt" aria-labelledby="checkin-step">
        {prompt}
      </p>

      {step < questions.length ? (
        <Scale
          labels={MOOD_LABELS}
          value={answers[questions[step].id] ?? null}
          onChange={(value) =>
            setAnswers((current) => ({ ...current, [questions[step].id]: value }))
          }
          idPrefix={`mood-${questions[step].id}`}
        />
      ) : step === energyStep ? (
        <Scale
          labels={ENERGY_LABELS}
          value={energy}
          onChange={setEnergy}
          idPrefix="energy"
        />
      ) : (
        <div className="checkin__time">
          <label className="checkin__time-label" htmlFor="checkin-minutes">
            Minutes available
          </label>
          <input
            id="checkin-minutes"
            className="checkin__time-input"
            type="number"
            min={10}
            max={480}
            step={5}
            value={timeWindow}
            onChange={(event) => setTimeWindow(Number(event.target.value))}
          />
          <div className="checkin__quick" role="group" aria-label="Quick time choices">
            {TIME_OPTIONS.map((minutes) => (
              <button
                className={`checkin__quick-btn${
                  timeWindow === minutes ? " checkin__quick-btn--active" : ""
                }`}
                key={minutes}
                type="button"
                aria-pressed={timeWindow === minutes}
                onClick={() => setTimeWindow(minutes)}
              >
                {minutes} min
              </button>
            ))}
          </div>
        </div>
      )}

      {error ? (
        <p className="form-error" id="checkin-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="checkin__actions">
        {step > 0 ? (
          <button
            className="btn btn--ghost"
            type="button"
            disabled={busy}
            onClick={goBack}
          >
            Back
          </button>
        ) : (
          <span />
        )}

        {step < timeStep ? (
          <button
            className="btn btn--primary"
            type="button"
            id="checkin-next"
            disabled={busy || (step < questions.length
              ? answers[questions[step].id] === undefined
              : energy === null)}
            onClick={goNext}
          >
            Next
          </button>
        ) : (
          <button
            className="btn btn--primary"
            type="button"
            id="checkin-save"
            disabled={busy || !Number.isFinite(timeWindow) || timeWindow < 10 || timeWindow > 480}
            onClick={() => void handleFinish()}
          >
            {busy ? "Saving…" : "See my suggestions"}
          </button>
        )}
      </div>
    </section>
  );
}

type ScaleProps = {
  labels: string[];
  value: number | null;
  onChange: (value: number) => void;
  idPrefix: string;
};

function Scale({ labels, value, onChange, idPrefix }: ScaleProps) {
  return (
    <div className="checkin__scale" role="group" aria-label="Choose a rating from 1 to 5">
      {labels.map((label, index) => {
        const rating = index + 1;
        return (
          <button
            className={`checkin__choice${value === rating ? " checkin__choice--active" : ""}`}
            key={label}
            id={`${idPrefix}-${rating}`}
            type="button"
            aria-pressed={value === rating}
            onClick={() => onChange(rating)}
          >
            <span className="checkin__choice-number">{rating}</span>
            <span className="checkin__choice-label">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
