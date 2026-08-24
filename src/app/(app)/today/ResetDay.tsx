"use client";

import { useState, useTransition } from "react";
import { describeDay, resetDay, type DaySummary } from "../actions";

export default function ResetDay({
  date,
  label,
}: {
  date: string;
  label: string;
}) {
  const [summary, setSummary] = useState<DaySummary | null>(null);
  const [loading, startLoading] = useTransition();
  const [deleting, startDeleting] = useTransition();

  const open = () =>
    startLoading(async () => setSummary(await describeDay(date)));

  if (!summary) {
    return (
      <button onClick={open} disabled={loading} className="btn-quiet w-full text-xs">
        {loading ? "Checking…" : `Reset ${label.toLowerCase()}`}
      </button>
    );
  }

  const items: string[] = [];
  if (summary.ticks > 0) {
    items.push(`${summary.ticks} tick${summary.ticks === 1 ? "" : "s"}`);
  }
  if (summary.hasNote) items.push("your note");
  for (const workout of summary.workouts) {
    items.push(
      `a workout (${workout.kind}${workout.minutes ? `, ${workout.minutes} min` : ""})`,
    );
  }
  if (summary.weight) items.push(`your weigh-in (${summary.weight})`);

  if (items.length === 0) {
    return (
      <div className="card p-4 text-center">
        <p className="text-sm text-muted">
          Nothing logged for {label.toLowerCase()} — nothing to reset.
        </p>
        <button onClick={() => setSummary(null)} className="btn-quiet mt-2 text-xs">
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="card border-bad/40 p-4">
      <p className="text-sm font-semibold">Reset {label.toLowerCase()}?</p>
      <p className="mt-1 text-sm text-muted">This deletes {joinNicely(items)}.</p>
      <p className="mt-1 text-xs text-muted">
        It can&apos;t be undone, and the day goes back to never-logged — which
        counts as zero on your crew&apos;s leaderboard.
      </p>
      <div className="mt-4 flex gap-2">
        <button
          onClick={() =>
            startDeleting(async () => {
              await resetDay(date);
              setSummary(null);
            })
          }
          disabled={deleting}
          className="btn-danger flex-1"
        >
          {deleting ? "Deleting…" : "Delete it"}
        </button>
        <button onClick={() => setSummary(null)} className="btn-ghost">
          Keep it
        </button>
      </div>
    </div>
  );
}

function joinNicely(items: string[]): string {
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
