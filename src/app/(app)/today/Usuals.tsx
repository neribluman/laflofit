"use client";

import { useState, useTransition } from "react";
import { addUsual } from "./actions";
import type { Usual } from "@/lib/usuals";

/**
 * The things you eat all the time, one tap away.
 *
 * A row of chips rather than a list, because this is meant to be glanced at
 * and skipped past on the way to the box — it's a shortcut, not a menu, and
 * anything taller would push the thing people came here for off the screen.
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

      {/* Scrolls sideways rather than wrapping: a fixed one-line height means
          the box below never moves as the list changes through the day. */}
      <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {usuals.map((usual) => {
          const done = added.includes(usual.key);
          const working = busy === usual.key;

          return (
            <li key={usual.key} className="shrink-0">
              <button
                onClick={() => tap(usual)}
                disabled={working}
                aria-label={`Add ${usual.label}${
                  usual.calories != null ? `, ${usual.calories} calories` : ""
                }`}
                className={`flex max-w-[15rem] items-center gap-2 rounded-full border px-3 py-2 text-left transition ${
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
                  <span className="nums block text-[11px] text-muted">
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
