"use client";

import { useState, useTransition } from "react";
import {
  readProfile,
  saveProfile,
  type ReadProfileResult,
} from "@/app/(app)/profile-actions";
import type { ProfileReport } from "@/lib/interpret";

const EXAMPLE =
  "34, male, 181cm, about 84kg. Desk job but I lift four times a week. Trying to get down to 78 without losing strength. Dodgy left knee so no running. Don't eat pork.";

const sentence = (value: string | null) =>
  value ? value.charAt(0).toUpperCase() + value.slice(1) : null;

export default function IntakeStep({
  thisYear,
  weightUnit,
  lengthUnit,
}: {
  thisYear: number;
  weightUnit: string;
  lengthUnit: string;
}) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<ReadProfileResult | null>(null);
  const [reading, startReading] = useTransition();
  const [saving, startSaving] = useTransition();

  const read = () =>
    startReading(async () => setResult(await readProfile(text)));

  const save = (report: ProfileReport) =>
    startSaving(async () => {
      await saveProfile(report, thisYear);
    });

  return (
    <div className="card p-5">
      <label className="label" htmlFor="about-you">
        In your own words
      </label>
      <textarea
        id="about-you"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        maxLength={1500}
        placeholder={EXAMPLE}
        className="field resize-none text-base leading-relaxed"
      />

      {reading && (
        <div className="mt-3 space-y-2" aria-live="polite">
          <p className="text-sm text-muted">Reading…</p>
          {[0, 1].map((i) => (
            <div
              key={i}
              className="h-3 animate-pulse rounded bg-surface-2"
              style={{ width: `${[88, 62][i]}%`, animationDelay: `${i * 140}ms` }}
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
          {reading ? "Reading…" : "Read it"}
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
        <div className="mt-4 border-t border-line pt-4">
          <p className="label">Here&apos;s what I got</p>
          <dl className="space-y-1.5 text-sm">
            {(
              [
                ["Age", result.report.age ? `${result.report.age}` : null],
                ["Sex", sentence(result.report.sex)],
                ["Height", result.report.height ? `${result.report.height} ${lengthUnit}` : null],
                ["Weight", result.report.weight ? `${result.report.weight} ${weightUnit}` : null],
                [
                  "Goal",
                  result.report.goal_weight
                    ? `${result.report.goal_weight} ${weightUnit}`
                    : null,
                ],
                ["Normal week", sentence(result.report.activity_level)],
              ] as [string, string | null][]
            )
              .filter(([, value]) => value)
              .map(([label, value]) => (
                <div key={label} className="flex gap-2">
                  <dt className="w-24 shrink-0 text-muted">{label}</dt>
                  <dd className="nums font-medium">{value}</dd>
                </div>
              ))}
          </dl>

          {result.report.about && (
            <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-sm">
              {result.report.about}
            </p>
          )}

          {result.report.unclear.length > 0 && (
            <p className="mt-3 text-xs text-muted">
              Didn&apos;t know what to do with: {result.report.unclear.join("; ")}.
            </p>
          )}

          <div className="mt-4 flex gap-2">
            <button
              onClick={() => save(result.report)}
              disabled={saving}
              className="btn-primary flex-1"
            >
              {saving ? "Saving…" : "That's me"}
            </button>
            <button onClick={() => setResult(null)} className="btn-ghost">
              Redo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
