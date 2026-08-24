"use client";

import { useState, useTransition } from "react";
import { readDay, applyDay, type ReadResult } from "./actions";
import type { DayReport } from "@/lib/interpret";
import { macroTotals } from "@/lib/macros";

const EXAMPLE =
  "Two eggs and black coffee at 7, chicken caesar for lunch, beans and steak for dinner. Caved and had a slice of bread. 3L water. Ran 5k, felt easy. 84.1kg this morning.";

export default function NaturalLog({
  date,
  weightUnit,
}: {
  date: string;
  weightUnit: string;
}) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<ReadResult | null>(null);
  const [applied, setApplied] = useState(false);
  const [reading, startReading] = useTransition();
  const [applying, startApplying] = useTransition();

  const read = () =>
    startReading(async () => {
      setApplied(false);
      setResult(await readDay(date, text));
    });

  const apply = (report: DayReport) =>
    startApplying(async () => {
      await applyDay(date, report);
      setApplied(true);
      setResult(null);
      setText("");
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

  return (
    <div className="card p-4">
      <label className="label" htmlFor="day-text">
        Just tell me about your day
      </label>
      <textarea
        id="day-text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder={EXAMPLE}
        className="field resize-none"
      />

      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={read}
          disabled={reading || text.trim().length < 3}
          className="btn-primary flex-1"
        >
          {reading ? "Reading…" : "Read my day"}
        </button>
        {text.length === 0 && (
          <button
            type="button"
            onClick={() => setText(EXAMPLE)}
            className="btn-quiet px-3 text-xs"
          >
            Example
          </button>
        )}
      </div>

      {result && !result.ok && (
        <p className="mt-3 text-sm text-bad">{result.error}</p>
      )}

      {result?.ok && (
        <Preview
          report={result.report}
          labels={result.labels}
          weightUnit={weightUnit}
          applying={applying}
          onApply={() => apply(result.report)}
          onDiscard={() => setResult(null)}
        />
      )}
    </div>
  );
}

function Preview({
  report,
  labels,
  weightUnit,
  applying,
  onApply,
  onDiscard,
}: {
  report: DayReport;
  labels: Record<string, string>;
  weightUnit: string;
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
    <div className="mt-4 border-t border-line pt-4">
      <p className="label">Here&apos;s what I got</p>

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
            <span>
              {workout.kind}
              {workout.minutes ? `, ${workout.minutes} min` : ""} ·{" "}
              {workout.intensity}
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
            {applying ? "Logging…" : "Log all this"}
          </button>
          <button onClick={onDiscard} className="btn-ghost">
            Discard
          </button>
        </div>
      )}
    </div>
  );
}
