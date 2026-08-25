"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { logDay, logPlate, undoLog, type LogResult, type LogReceipt } from "./actions";
import { shrinkImage } from "@/lib/image";
import type { DayReport } from "@/lib/interpret";
import { macroTotals } from "@/lib/macros";
import { describeExercise } from "@/lib/exercise-format";

const EXAMPLE =
  "Two eggs and black coffee at 7, chicken caesar for lunch, beans and steak for dinner. Caved and had a slice of bread. 3L water. Squats 5x5 at 100kg then bench 3x8 at 70. 84.1kg this morning.";

type Saved = { report: DayReport; labels: Record<string, string>; receipt: LogReceipt };

export default function NaturalLog({
  date,
  weightUnit,
  distanceUnit,
  prominent = false,
  fallbackHref,
}: {
  date: string;
  weightUnit: string;
  distanceUnit: string;
  /** On an untouched day this box is the whole screen, so give it room. */
  prominent?: boolean;
  /** Shown under the box while composing, and hidden once there's a result. */
  fallbackHref?: string;
}) {
  const [text, setText] = useState("");
  const [saved, setSaved] = useState<Saved | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [undone, setUndone] = useState(false);
  const [working, startWorking] = useTransition();
  const [undoing, startUndoing] = useTransition();

  const handle = (result: LogResult, spentText: boolean) => {
    if (result.ok) {
      setSaved({ report: result.report, labels: result.labels, receipt: result.receipt });
      setError(null);
      setUndone(false);
      if (spentText) setText("");
    } else {
      setError(result.error);
    }
  };

  // One press. It used to read the text, show a proposal, and wait for a
  // second press to save — and people took the proposal for the result and
  // walked away, losing the lot.
  const log = () =>
    startWorking(async () => {
      setError(null);
      try {
        handle(await logDay(date, text), true);
      } catch {
        setError("That didn't get through — your text is still here, try again.");
      }
    });

  const logPhoto = (file: File | undefined) => {
    if (!file) return;
    startWorking(async () => {
      setError(null);
      try {
        handle(await logPlate(date, await shrinkImage(file)), false);
      } catch {
        setError("Couldn't read that image. Try another.");
      }
    });
  };

  const undo = () => {
    if (!saved) return;
    startUndoing(async () => {
      try {
        await undoLog(saved.receipt);
        setUndone(true);
        setSaved(null);
      } catch {
        setError("Couldn't undo that. Delete the items below instead.");
      }
    });
  };

  return (
    <div className="card p-4">
      {saved && (
        <div className="mb-3 rounded-xl border border-accent/40 bg-accent/5 p-3">
          <div className="flex items-baseline gap-2">
            <p className="flex-1 text-sm font-semibold">
              <span aria-hidden>✓</span> Logged
            </p>
            <button
              onClick={undo}
              disabled={undoing}
              className="btn-quiet shrink-0 px-2 py-1 text-xs"
            >
              {undoing ? "Undoing…" : "Undo"}
            </button>
          </div>
          <Summary
            report={saved.report}
            labels={saved.labels}
            weightUnit={weightUnit}
            distanceUnit={distanceUnit}
          />
          <p className="mt-2 text-xs text-muted">
            It&apos;s in your day below — change or delete anything there.
          </p>
        </div>
      )}

      {undone && !saved && (
        <p
          aria-live="polite"
          className="mb-3 rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm text-muted"
        >
          Undone. Nothing was kept.
        </p>
      )}

      <label className="label" htmlFor="day-text">
        Just tell me about your day
      </label>
      <textarea
        id="day-text"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (saved) setSaved(null);
          if (undone) setUndone(false);
        }}
        rows={prominent ? 6 : 3}
        maxLength={2000}
        placeholder={EXAMPLE}
        className={`field resize-none ${prominent ? "text-base leading-relaxed" : ""}`}
      />

      {working && (
        <div className="mt-3 space-y-2" aria-live="polite">
          <p className="text-sm text-muted">Reading it and logging it…</p>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-3 animate-pulse rounded bg-surface-2"
              style={{ width: `${[92, 74, 58][i]}%`, animationDelay: `${i * 140}ms` }}
            />
          ))}
        </div>
      )}

      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={log}
          disabled={working || text.trim().length < 3}
          className="btn-primary flex-1"
        >
          {working ? "Logging…" : "Log my day"}
        </button>
        <label
          aria-label="Photograph your plate"
          title="Photograph your plate"
          className="btn-ghost shrink-0 cursor-pointer px-3"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 8.5A1.5 1.5 0 014.5 7h2L8 5h8l1.5 2h2A1.5 1.5 0 0121 8.5v9A1.5 1.5 0 0119.5 19h-15A1.5 1.5 0 013 17.5z" />
            <circle cx="12" cy="13" r="3.2" />
          </svg>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            disabled={working}
            onChange={(e) => {
              logPhoto(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
      </div>

      <p className="mt-2 text-center text-xs text-muted">
        Food, training, weight, how it went — all of it, in one go. Or
        photograph your plate.
      </p>

      {fallbackHref && !saved && (
        <p className="mt-3 text-center text-sm text-muted">
          Or{" "}
          <Link href={fallbackHref} className="font-medium text-accent">
            fill it in yourself
          </Link>{" "}
          instead.
        </p>
      )}

      {error && (
        <p aria-live="polite" className="mt-3 text-sm text-bad">
          {error}
        </p>
      )}
    </div>
  );
}

/** What just went in. A receipt, not a decision — it is already saved. */
function Summary({
  report,
  labels,
  weightUnit,
  distanceUnit,
}: {
  report: DayReport;
  labels: Record<string, string>;
  weightUnit: string;
  distanceUnit: string;
}) {
  const totals = macroTotals(report.meals);

  return (
    <div className="mt-2">
      {report.meals.length > 0 && (
        <div className="mb-2">
          <div className="flex items-baseline gap-2">
            <span className="nums text-lg font-bold leading-none">
              {totals.calories.toLocaleString()}
            </span>
            <span className="text-xs text-muted">kcal</span>
            <span className="nums ml-auto text-xs text-muted">
              P {totals.protein} · C {totals.carbs} · F {totals.fat}
            </span>
          </div>
          <ul className="mt-1 space-y-0.5">
            {report.meals.map((meal, i) => (
              <li key={`m${i}`} className="flex gap-2 text-xs text-muted">
                <span className="min-w-0 flex-1 truncate">{meal.description}</span>
                <span className="nums shrink-0">
                  {meal.calories != null ? `${Math.round(meal.calories)}` : "—"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ul className="space-y-1">
        {report.rules.map((entry) => (
          <li key={entry.rule_id} className="flex items-start gap-2 text-xs">
            <span aria-hidden className={entry.met === false ? "text-bad" : "text-accent"}>
              {entry.value != null ? "•" : entry.met ? "✓" : "✗"}
            </span>
            <span className="min-w-0 flex-1 text-muted">
              {labels[entry.rule_id]}
              {entry.value != null && (
                <span className="nums font-semibold text-text"> — {entry.value}</span>
              )}
            </span>
          </li>
        ))}

        {report.workouts.map((workout, i) => (
          <li key={`w${i}`} className="flex items-start gap-2 text-xs">
            <span aria-hidden className="text-cool">▲</span>
            <span className="min-w-0 flex-1">
              {workout.kind}
              {workout.minutes ? `, ${workout.minutes} min` : ""} · {workout.intensity}
              {workout.exercises?.length > 0 && (
                <span className="mt-0.5 block">
                  {workout.exercises.map((exercise, j) => (
                    <span key={`e${j}`} className="flex gap-2 text-muted">
                      <span className="min-w-0 flex-1 truncate">{exercise.name}</span>
                      <span className="nums shrink-0">
                        {describeExercise(exercise, weightUnit, distanceUnit) || "—"}
                      </span>
                    </span>
                  ))}
                </span>
              )}
            </span>
          </li>
        ))}

        {report.weight != null && (
          <li className="flex items-start gap-2 text-xs">
            <span aria-hidden className="text-cool">▲</span>
            <span className="nums text-muted">
              Weigh-in: {report.weight} {weightUnit}
            </span>
          </li>
        )}
      </ul>

      {report.unclear.length > 0 && (
        <p className="mt-2 text-xs text-muted">
          Didn&apos;t know what to do with: {report.unclear.join("; ")}.
        </p>
      )}
    </div>
  );
}
