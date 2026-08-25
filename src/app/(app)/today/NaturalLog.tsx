"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { readDay, readPlate, applyDay, type ReadResult } from "./actions";
import { shrinkImage } from "@/lib/image";
import type { DayReport } from "@/lib/interpret";
import { macroTotals } from "@/lib/macros";
import { describeExercise } from "@/lib/exercise-format";

const EXAMPLE =
  "Two eggs and black coffee at 7, chicken caesar for lunch, beans and steak for dinner. Caved and had a slice of bread. 3L water. Squats 5x5 at 100kg then bench 3x8 at 70. 84.1kg this morning.";

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
  const [result, setResult] = useState<ReadResult | null>(null);
  const [applied, setApplied] = useState(false);
  const [reading, startReading] = useTransition();
  const [applying, startApplying] = useTransition();
  const [photo, setPhoto] = useState<string | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const reviewRef = useRef<HTMLDivElement>(null);

  // Once there's something to check, put it in front of them. Otherwise the
  // result lands below the fold and the page looks like nothing happened.
  const reviewing = result?.ok === true;
  useEffect(() => {
    if (reviewing) {
      reviewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [reviewing]);

  const read = () =>
    startReading(async () => {
      setApplied(false);
      setPhoto(null);
      setResult(await readDay(date, text));
    });

  const readPhoto = (file: File | undefined) => {
    if (!file) return;
    startReading(async () => {
      setApplied(false);
      try {
        const shrunk = await shrinkImage(file);
        setPhoto(shrunk);
        setResult(await readPlate(date, shrunk));
      } catch {
        setPhoto(null);
        setResult({ ok: false, error: "Couldn't read that image. Try another." });
      }
    });
  };

  const apply = (report: DayReport) =>
    startApplying(async () => {
      await applyDay(date, report);
      setApplied(true);
      setResult(null);
      setText("");
      setPhoto(null);
    });

  if (applied) {
    return (
      <div className="card flex items-center gap-3 border-accent/50 bg-accent/5 p-4">
        <span className="text-xl">✓</span>
        <p className="flex-1 text-sm">Logged. Everything below is updated.</p>
        <button onClick={() => setApplied(false)} className="btn-quiet px-2 py-1 text-xs">
          Add more
        </button>
      </div>
    );
  }

  // While reviewing, what they wrote collapses to a quiet line with a way back
  // to it. Two big green buttons on screen at once is the whole problem.
  if (reviewing && result?.ok) {
    return (
      <div className="card p-4" ref={reviewRef}>
        <div className="flex items-start gap-3">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photo}
              alt="The plate you photographed"
              className="h-16 w-16 shrink-0 rounded-xl object-cover"
            />
          ) : (
            <p className="min-w-0 flex-1 text-sm text-muted">
              <span className="line-clamp-2 italic">&ldquo;{text}&rdquo;</span>
            </p>
          )}
          {photo && (
            <p className="min-w-0 flex-1 text-sm text-muted">
              From your photo. Portions are estimated from the picture — check
              them.
            </p>
          )}
          <button
            onClick={() => {
              setResult(null);
              setPhoto(null);
            }}
            className="btn-quiet shrink-0 px-2 py-1 text-xs"
          >
            {photo ? "Retake" : "Edit"}
          </button>
        </div>

        <div className="mt-4 border-t border-line pt-4">
          <p className="label mb-0">Here&apos;s what I got</p>
          <p className="mt-0.5 mb-3 text-xs text-muted">
            Check it over — nothing is saved until you log it.
          </p>
          <Preview
            report={result.report}
            labels={result.labels}
            weightUnit={weightUnit}
            distanceUnit={distanceUnit}
            applying={applying}
            onApply={() => apply(result.report)}
            onDiscard={() => {
              setResult(null);
              setText("");
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="card p-4">
      <label className="label" htmlFor="day-text">
        Just tell me about your day
      </label>
      <textarea
        id="day-text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={prominent ? 6 : 3}
        maxLength={2000}
        placeholder={EXAMPLE}
        className={`field resize-none ${prominent ? "text-base leading-relaxed" : ""}`}
      />

      {reading && (
        <div className="mt-3 space-y-2" aria-live="polite">
          <p className="text-sm text-muted">
            {photo ? "Looking at your plate…" : "Analysing your day…"}
          </p>
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
          onClick={read}
          disabled={reading || text.trim().length < 3}
          className="btn-primary flex-1"
        >
          {reading ? "Analysing…" : "Analyse my day"}
        </button>
        <button
          type="button"
          onClick={() => camera.current?.click()}
          disabled={reading}
          aria-label="Photograph your plate"
          title="Photograph your plate"
          className="btn-ghost shrink-0 px-3"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 8.5A1.5 1.5 0 014.5 7h2L8 5h8l1.5 2h2A1.5 1.5 0 0121 8.5v9A1.5 1.5 0 0119.5 19h-15A1.5 1.5 0 013 17.5z" />
            <circle cx="12" cy="13" r="3.2" />
          </svg>
        </button>
      </div>

      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(e) => {
          readPhoto(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      <p className="mt-2 text-center text-xs text-muted">
        Food, training, weight, how it went — all of it, in one go. Or
        photograph your plate.
      </p>

      {fallbackHref && (
        <p className="mt-3 text-center text-sm text-muted">
          Or{" "}
          <Link href={fallbackHref} className="font-medium text-accent">
            fill it in yourself
          </Link>{" "}
          instead.
        </p>
      )}

      {result && !result.ok && (
        <p className="mt-3 text-sm text-bad">{result.error}</p>
      )}

    </div>
  );
}

function Preview({
  report,
  labels,
  weightUnit,
  distanceUnit,
  applying,
  onApply,
  onDiscard,
}: {
  report: DayReport;
  labels: Record<string, string>;
  weightUnit: string;
  distanceUnit: string;
  applying: boolean;
  onApply: () => void;
  onDiscard: () => void;
}) {
  const totals = macroTotals(report.meals);
  const nothing =
    report.meals.length === 0 &&
    report.rules.length === 0 &&
    report.workouts.length === 0 &&
    report.weight == null;

  return (
    <div>

      {nothing && (
        <p className="text-sm text-muted">
          Nothing I could work with. Try naming what you ate, what you trained,
          or what you weighed.
        </p>
      )}

      {report.meals.length > 0 && (
        <div className="mb-3 rounded-xl bg-surface-2 p-3">
          <div className="flex items-baseline gap-2">
            <span className="nums text-2xl font-bold leading-none">
              {totals.calories.toLocaleString()}
            </span>
            <span className="text-xs text-muted">kcal</span>
            <span className="nums ml-auto text-xs text-muted">
              P {totals.protein} · C {totals.carbs} · F {totals.fat}
              {totals.fibre > 0 ? ` · Fibre ${totals.fibre}` : ""}
            </span>
          </div>
          <ul className="mt-2 space-y-1">
            {report.meals.map((meal, i) => (
              <li key={`m${i}`} className="flex gap-2 text-xs">
                <span className="min-w-0 flex-1 truncate">{meal.description}</span>
                <span className="nums shrink-0 text-muted">
                  {meal.calories != null ? `${Math.round(meal.calories)} kcal` : "—"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ul className="space-y-1.5">
        {report.rules.map((entry) => (
          <li key={entry.rule_id} className="flex items-start gap-2 text-sm">
            <span
              aria-hidden
              className={entry.met === false ? "text-bad" : "text-accent"}
            >
              {entry.value != null ? "•" : entry.met ? "✓" : "✗"}
            </span>
            <span className="min-w-0 flex-1">
              <span className={entry.met === false ? "text-muted line-through" : ""}>
                {labels[entry.rule_id]}
              </span>
              {entry.value != null && (
                <span className="nums font-semibold"> — {entry.value}</span>
              )}
              {entry.evidence && (
                <span className="block text-xs text-muted">
                  &ldquo;{entry.evidence}&rdquo;
                </span>
              )}
            </span>
          </li>
        ))}

        {report.workouts.map((workout, i) => (
          <li key={`w${i}`} className="flex items-start gap-2 text-sm">
            <span aria-hidden className="text-cool">
              ▲
            </span>
            <span className="min-w-0 flex-1">
              {workout.kind}
              {workout.minutes ? `, ${workout.minutes} min` : ""} ·{" "}
              {workout.intensity}
              {workout.exercises?.length > 0 && (
                <span className="mt-1 block space-y-0.5">
                  {workout.exercises.map((exercise, j) => (
                    <span key={`e${j}`} className="flex gap-2 text-xs text-muted">
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
          <li className="flex items-start gap-2 text-sm">
            <span aria-hidden className="text-cool">
              ▲
            </span>
            <span className="nums">
              Weigh-in: {report.weight} {weightUnit}
            </span>
          </li>
        )}
      </ul>

      {report.unclear.length > 0 && (
        <p className="mt-3 text-xs text-muted">
          Didn&apos;t know what to do with: {report.unclear.join("; ")}. Tick
          those by hand below.
        </p>
      )}

      {!nothing && (
        <div className="mt-4 flex gap-2">
          <button onClick={onApply} disabled={applying} className="btn-primary flex-1">
            {applying ? "Logging…" : "Log this"}
          </button>
          <button onClick={onDiscard} className="btn-quiet px-3">
            Discard
          </button>
        </div>
      )}
    </div>
  );
}
