"use client";

import { useState } from "react";
import { weekdayLetter } from "@/lib/dates";
import type { WeekStanding } from "@/lib/scoring";

export type LeaderRow = {
  id: string;
  name: string;
  emoji: string;
  isMe: boolean;
  standing: WeekStanding;
};

const MEDALS = ["🥇", "🥈", "🥉"];

export default function Leaderboard({ rows }: { rows: LeaderRow[] }) {
  const [open, setOpen] = useState<string | null>(null);

  // Bars are drawn against the leader, not against a theoretical 700 — it
  // should read as a race between these people, not a mark out of full marks.
  const best = Math.max(...rows.map((row) => row.standing.points), 1);
  const me = rows.find((row) => row.isMe);
  const leader = rows[0];
  // me.isMe is true by definition — the test is whether I am also the leader.
  const gap =
    me && leader && me.id !== leader.id
      ? leader.standing.points - me.standing.points
      : 0;

  return (
    <div className="card p-4">
      <ol className="space-y-3">
        {rows.map((row, i) => {
          const { standing } = row;
          const expanded = open === row.id;
          return (
            <li key={row.id}>
              <button
                onClick={() => setOpen(expanded ? null : row.id)}
                aria-expanded={expanded}
                className="w-full text-left"
              >
                <div className="flex items-baseline gap-2 text-sm">
                  <span className="w-5 shrink-0 text-center">
                    {i < 3 ? MEDALS[i] : <span className="nums text-xs text-muted">{i + 1}</span>}
                  </span>
                  <span aria-hidden>{row.emoji}</span>
                  <span className={`min-w-0 flex-1 truncate ${row.isMe ? "font-semibold" : ""}`}>
                    {row.name}
                    {row.isMe && <span className="text-muted"> (you)</span>}
                  </span>
                  {standing.streak > 0 && (
                    <span className="nums shrink-0 text-xs text-warn">
                      🔥{standing.streak}
                    </span>
                  )}
                  <span className="nums shrink-0 font-bold">{standing.points}</span>
                </div>

                <div className="mt-1 ml-7 h-2 overflow-hidden rounded-full bg-track">
                  {standing.points > 0 && (
                    <div
                      className="h-full rounded-full transition-[width] duration-500"
                      style={{
                        width: `${Math.max(4, (standing.points / best) * 100)}%`,
                        background: row.isMe ? "var(--series)" : "var(--series-muted)",
                      }}
                    />
                  )}
                </div>

                <p className="nums mt-1 ml-7 text-xs text-muted">
                  {standing.daysLogged === 0
                    ? "nothing logged yet"
                    : `${standing.daysLogged} day${standing.daysLogged === 1 ? "" : "s"} · ${standing.average} avg${
                        standing.perfectDays > 0
                          ? ` · ${standing.perfectDays} perfect`
                          : ""
                      }`}
                  {!standing.loggedToday && " · not today"}
                </p>
              </button>

              {expanded && (
                <ol className="mt-2 ml-7 flex gap-1.5">
                  {standing.days.map((day) => (
                    <li key={day.date} className="flex flex-1 flex-col items-center gap-1">
                      <span className="text-[10px] text-muted">
                        {weekdayLetter(day.date)}
                      </span>
                      <span
                        className="nums flex h-7 w-full items-center justify-center rounded-md text-[10px] font-bold"
                        style={{
                          background: day.logged
                            ? `color-mix(in srgb, var(--series) ${Math.round(
                                20 + day.ratio * 80,
                              )}%, transparent)`
                            : "transparent",
                          border: day.logged ? "none" : "1.5px dashed var(--track)",
                        }}
                      >
                        {day.logged ? Math.round(day.ratio * 100) : ""}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </li>
          );
        })}
      </ol>

      <p className="mt-4 border-t border-line pt-3 text-xs text-muted">
        {gap > 0 ? (
          <>
            <span className="nums font-semibold text-text">{gap} points</span> behind{" "}
            {leader.name}. Each logged day is worth up to 100 — how much you get is
            how much of your plan you hit.
          </>
        ) : (
          <>Each logged day is worth up to 100 — how much you get is how much of
          your plan you hit. Tap anyone to see their week.</>
        )}
      </p>
    </div>
  );
}
