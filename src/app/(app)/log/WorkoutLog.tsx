"use client";

import { useState, useTransition } from "react";
import { readWorkout, applyWorkout, type ReadWorkoutResult } from "./actions";
import { describeExercise } from "@/lib/exercise-format";
import type { WorkoutReport } from "@/lib/interpret";

const EXAMPLE =
  "Squats 5x5 at 100kg, bench 3x8 at 70, pull-ups 3 sets to failure, then 15 min on the bike. Felt strong.";

export default function WorkoutLog({
  today,
  weightUnit,
  distanceUnit,
}: {
  today: string;
  weightUnit: string;
  distanceUnit: string;
}) {
  const [text, setText] = useState("");
  const [date, setDate] = useState(today);
  const [result, setResult] = useState<ReadWorkoutResult | null>(null);
  const [logged, setLogged] = useState(false);
  const [reading, startReading] = useTransition();
  const [saving, startSaving] = useTransition();

  const read = () =>
    startReading(async () => {
      setLogged(false);
      setResult(await readWorkout(text));
    });

  const save = (report: WorkoutReport) =>
    startSaving(async () => {
      await applyWorkout(date, report);
      setLogged(true);
      setResult(null);
      setText("");
    });

  if (logged) {
    return (
      <div className="card flex items-center gap-3 border-accent/50 bg-accent/5 p-4">
        <span className="text-xl">✓</span>
        <p className="flex-1 text-sm">Session logged.</p>
        <button onClick={() => setLogged(false)} className="btn-quiet px-2 py-1 text-xs">
          Add another
        </button>
      </div>
    );
  }

  return (
    <div className="card p-4">
      <label className="label" htmlFor="workout-text">
        Describe the session
      </label>
      <textarea
        id="workout-text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder={EXAMPLE}
        className="field resize-none"
      />

      <div className="mt-2 flex items-center gap-2">
        <input
          type="date"
          value={date}
          max={today}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Date of the session"
          className="field nums w-36 py-2 text-sm"
        />
        <button
          onClick={read}
          disabled={reading || text.trim().length < 3}
          className="btn-primary flex-1"
        >
          {reading ? "Reading…" : "Read it"}
        </button>
      </div>

      {result && !result.ok && (
        <p className="mt-3 text-sm text-bad">{result.error}</p>
      )}

      {result?.ok && (
        <div className="mt-4 border-t border-line pt-4">
          <p className="label">Here&apos;s what I got</p>

          {result.report.workouts.length === 0 ? (
            <p className="text-sm text-muted">
              No session in there I could pin down. Try naming the movements.
            </p>
          ) : (
            <ul className="space-y-3">
              {result.report.workouts.map((workout, i) => (
                <li key={`w${i}`}>
                  <p className="text-sm font-semibold">
                    {workout.kind}
                    {workout.minutes ? (
                      <span className="nums font-normal text-muted">
                        {" "}
                        · {workout.minutes} min
                      </span>
                    ) : null}
                    <span className="font-normal text-muted"> · {workout.intensity}</span>
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {workout.exercises.map((exercise, j) => (
                      <li key={`e${j}`} className="flex gap-2 text-xs">
                        <span className="min-w-0 flex-1 truncate">{exercise.name}</span>
                        <span className="nums shrink-0 text-muted">
                          {describeExercise(exercise, weightUnit, distanceUnit) || "—"}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {workout.notes && (
                    <p className="mt-1 text-xs text-muted">{workout.notes}</p>
                  )}
                </li>
              ))}
            </ul>
          )}

          {result.report.unclear.length > 0 && (
            <p className="mt-3 text-xs text-muted">
              Didn&apos;t know what to do with: {result.report.unclear.join("; ")}.
            </p>
          )}

          {result.report.workouts.length > 0 && (
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => save(result.report)}
                disabled={saving}
                className="btn-primary flex-1"
              >
                {saving ? "Logging…" : "Log it"}
              </button>
              <button onClick={() => setResult(null)} className="btn-ghost">
                Discard
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
