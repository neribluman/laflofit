"use client";

import { useState, useTransition } from "react";
import { addUsual } from "./actions";
import type { Usual } from "@/lib/usuals";

/**
 * The things you eat all the time, one tap away.
 *
 * Chips in two columns rather than a scrolling row. The row bled 16px past
 * each edge to hint that it scrolled, and nothing clipped it, so on a phone
 * the whole page scrolled sideways — measured at 497px against a 375px
 * screen. Wrapping instead fits, but six chips stack 244px tall and shove the
 * log box off the fold. An even grid is 118px and ends exactly at the margin.
 *
 * Ordering is done on the server and is mostly the clock: your breakfast at
 * breakfast time. Nobody wants last night's steak offered at seven in the
 * morning, and a shortcut you have to scan past is not a shortcut.
 */
export default function Usuals({
  date,
  usuals,
}: {
  date: string;
  usuals: Usual[];
}) {
  const [added, setAdded] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  if (usuals.length === 0) return null;

  const tap = (usual: Usual) => {
    setBusy(usual.key);
    setError(null);
    start(async () => {
      try {
        const result = await addUsual(date, usual.key);
        if (result.ok) setAdded((were) => [...were, usual.key]);
        else setError(result.error);
      } catch {
        setError("Couldn't add that. Try again.");
      } finally {
        setBusy(null);
      }
    });
  };

  return (
    <div>
      <p className="label mb-2">Your usuals</p>

      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {usuals.map((usual) => {
          const done = added.includes(usual.key);
          const working = busy === usual.key;

          return (
            // min-w-0 is load-bearing: a grid item defaults to min-width
            // auto, so text set not to wrap simply refuses to shrink and
            // pushes the column past the screen edge.
            <li key={usual.key} className="min-w-0">
              <button
                onClick={() => tap(usual)}
                disabled={working}
                aria-label={`Add ${usual.label}${
                  usual.calories != null ? `, ${usual.calories} calories` : ""
                }`}
                className={`flex w-full items-center gap-2 rounded-full border px-3 py-2 text-left transition ${
                  done
                    ? "border-accent/50 bg-accent/10"
                    : "border-line bg-surface hover:border-muted"
                }`}
              >
                <span aria-hidden className="shrink-0 text-sm">
                  {done ? "✓" : working ? "…" : "+"}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-medium">
                    {usual.label}
                  </span>
                  <span className="nums block truncate text-[11px] text-muted">
                    {usual.calories != null ? `${usual.calories} kcal` : "no numbers"}
                    {usual.protein_g ? ` · ${usual.protein_g}g P` : ""}
                    {usual.loggedToday ? " · had today" : ""}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {error && (
        <p aria-live="polite" className="mt-1 text-xs text-bad">
          {error}
        </p>
      )}

      {added.length > 0 && (
        <p aria-live="polite" className="mt-1 text-xs text-muted">
          Added {added.length === 1 ? "it" : `${added.length}`} to your day — delete
          below if that was wrong.
        </p>
      )}
    </div>
  );
}
