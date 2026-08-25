"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ensureReview } from "./review-actions";
import type { PlanReview } from "@/lib/plan-review";

const TONE: Record<string, { label: string; className: string }> = {
  "check this": {
    label: "Check this",
    className: "border-bad/40 bg-bad/5",
  },
  "worth changing": {
    label: "Worth changing",
    className: "border-warn/40 bg-warn/5",
  },
  nudge: { label: "Nudge", className: "border-line bg-surface-2" },
};

export default function PlanReviewCard({ initial }: { initial: PlanReview | null }) {
  const [review, setReview] = useState<PlanReview | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [running, start] = useTransition();

  const run = () =>
    start(async () => {
      setError(null);
      try {
        const result = await ensureReview();
        if (result) setReview(result);
        else setError("Couldn't write one just now. Try again in a minute.");
      } catch {
        setError("Couldn't write one just now. Try again in a minute.");
      }
    });

  return (
    <div className="card p-4">
      {!review && !running && (
        <p className="mb-3 text-sm text-muted">
          Your plan is whatever you typed into it. This reads your numbers, your
          goal and what you&apos;ve actually been logging, and tells you where
          they don&apos;t line up.
        </p>
      )}

      {running && (
        <div className="space-y-2" aria-live="polite">
          <p className="text-sm text-muted">Reading your profile and your logs…</p>
          {[88, 96, 72].map((width, i) => (
            <div
              key={i}
              className="h-3 animate-pulse rounded bg-surface-2"
              style={{ width: `${width}%`, animationDelay: `${i * 140}ms` }}
            />
          ))}
        </div>
      )}

      {review && !running && (
        <>
          <p className="text-sm leading-relaxed">{review.verdict}</p>

          {review.suggestions.length > 0 && (
            <ul className="mt-4 space-y-2.5">
              {review.suggestions.map((suggestion, i) => {
                const tone = TONE[suggestion.weight] ?? TONE.nudge;
                return (
                  <li
                    key={`${suggestion.about}-${i}`}
                    className={`rounded-xl border p-3 ${tone.className}`}
                  >
                    <p className="flex items-baseline gap-2">
                      <span className="text-sm font-semibold">{suggestion.about}</span>
                      <span className="ml-auto shrink-0 text-[10px] font-semibold tracking-wide text-muted uppercase">
                        {tone.label}
                      </span>
                    </p>
                    <p className="mt-1 text-sm">{suggestion.change}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted">
                      {suggestion.why}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}

          {review.keep.length > 0 && (
            <ul className="mt-3 space-y-1 border-t border-line pt-3">
              {review.keep.map((line, i) => (
                <li key={i} className="flex gap-2 text-xs text-muted">
                  <span aria-hidden className="text-accent">
                    ✓
                  </span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-3 text-xs text-muted">
            Suggestions, not instructions — nothing here changed your plan.{" "}
            <Link href="/plan" className="font-medium text-accent">
              Edit it yourself
            </Link>
            . And this is a language model reading numbers, not a dietitian: for
            anything marked <em>Check this</em>, ask a real one.
          </p>
        </>
      )}

      <button
        onClick={run}
        disabled={running}
        className={`${review ? "btn-quiet mt-3 w-full" : "btn-primary w-full"}`}
      >
        {running
          ? "Reading…"
          : review
            ? "Look again"
            : "View my profile and suggest"}
      </button>

      {error && (
        <p aria-live="polite" className="mt-2 text-sm text-bad">
          {error}
        </p>
      )}
    </div>
  );
}
