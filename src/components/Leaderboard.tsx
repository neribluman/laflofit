"use client";

import { useState } from "react";
import { weekdayLetter } from "@/lib/dates";
import type { WeekStanding } from "@/lib/scoring";
import type { BoardEntry, BoardKey } from "@/lib/boards";

export type LeaderRow = {
  id: string;
  name: string;
  emoji: string;
  isMe: boolean;
  standing: WeekStanding;
  boards: Record<BoardKey, BoardEntry>;
};

const MEDALS = ["🥇", "🥈", "🥉"];

const BOARDS: { key: BoardKey; tab: string; note: string }[] = [
  {
    key: "overall",
    tab: "Overall",
    note: "Each logged day is worth up to 100 — how much you get is how much of your plan you hit.",
  },
  {
    key: "protein",
    tab: "Protein",
    note: "Grams of protein per kilo of bodyweight, averaged over the days you logged food. Most strength plans aim somewhere between 1.6 and 2.2.",
  },
  {
    key: "calories",
    tab: "Calories",
    note: "How close you stayed to your own calorie target — eating under counts against you exactly as much as eating over. 100 is dead on.",
  },
  {
    key: "strength",
    tab: "Strength",
    note: "Your best estimated single on squat, bench, deadlift and overhead press, added together and divided by your bodyweight.",
  },
];

export default function Leaderboard({ rows }: { rows: LeaderRow[] }) {
  const [board, setBoard] = useState<BoardKey>("overall");
  const [open, setOpen] = useState<string | null>(null);

  const current = BOARDS.find((b) => b.key === board)!;

  const ranked = [...rows].sort((a, b) => {
    const left = a.boards[board];
    const right = b.boards[board];
    if (left.missing !== right.missing) return left.missing ? 1 : -1;
    return right.value - left.value;
  });

  const scored = ranked.filter((row) => !row.boards[board].missing);
  const best = Math.max(...scored.map((row) => row.boards[board].value), 0.0001);

  const me = rows.find((row) => row.isMe);
  const leader = scored[0];
  const gap =
    board === "overall" && me && leader && me.id !== leader.id
      ? leader.standing.points - me.standing.points
      : 0;

  return (
    <div className="card p-4">
      <div className="mb-4 grid grid-cols-4 gap-1 rounded-xl bg-surface-2 p-1">
        {BOARDS.map((option) => (
          <button
            key={option.key}
            onClick={() => setBoard(option.key)}
            aria-pressed={board === option.key}
            className={`rounded-lg py-1.5 text-xs font-semibold transition ${
              board === option.key ? "bg-accent text-accent-ink" : "text-muted"
            }`}
          >
            {option.tab}
          </button>
        ))}
      </div>

      <ol className="space-y-3">
        {ranked.map((row, i) => {
          const entry = row.boards[board];
          const expandable = board === "overall";
          const expanded = open === row.id && expandable;

          return (
            <li key={row.id}>
              <button
                onClick={() => expandable && setOpen(expanded ? null : row.id)}
                aria-expanded={expandable ? expanded : undefined}
                className="w-full text-left"
                disabled={!expandable}
              >
                <div className="flex items-baseline gap-2 text-sm">
                  <span className="w-5 shrink-0 text-center">
                    {entry.missing ? (
                      <span className="text-xs text-muted">·</span>
                    ) : i < 3 ? (
                      MEDALS[i]
                    ) : (
                      <span className="nums text-xs text-muted">{i + 1}</span>
                    )}
                  </span>
                  <span aria-hidden>{row.emoji}</span>
                  <span
                    className={`min-w-0 flex-1 truncate ${row.isMe ? "font-semibold" : ""} ${
                      entry.missing ? "text-muted" : ""
                    }`}
                  >
                    {row.name}
                    {row.isMe && <span className="text-muted"> (you)</span>}
                  </span>
                  {board === "overall" && row.standing.streak > 0 && (
                    <span className="nums shrink-0 text-xs text-warn">
                      🔥{row.standing.streak}
                    </span>
                  )}
                  <span
                    className={`nums shrink-0 font-bold ${entry.missing ? "text-muted" : ""}`}
                  >
                    {entry.display}
                  </span>
                </div>

                <div className="mt-1 ml-7 h-2 overflow-hidden rounded-full bg-track">
                  {!entry.missing && entry.value > 0 && (
                    <div
                      className="h-full rounded-full transition-[width] duration-500"
                      style={{
                        width: `${Math.max(4, (entry.value / best) * 100)}%`,
                        background: row.isMe ? "var(--series)" : "var(--series-muted)",
                      }}
                    />
                  )}
                </div>

                <p className="nums mt-1 ml-7 text-xs text-muted">
                  {board === "overall"
                    ? row.standing.daysLogged === 0
                      ? "nothing logged yet"
                      : `${row.standing.daysLogged} day${row.standing.daysLogged === 1 ? "" : "s"} · ${row.standing.average} avg${
                          row.standing.perfectDays > 0
                            ? ` · ${row.standing.perfectDays} perfect`
                            : ""
                        }${row.standing.loggedToday ? "" : " · not today"}`
                    : entry.detail}
                </p>
              </button>

              {expanded && (
                <ol className="mt-2 ml-7 flex gap-1.5">
                  {row.standing.days.map((day) => (
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
        {gap > 0 && (
          <>
            <span className="nums font-semibold text-text">{gap} points</span> behind{" "}
            {leader.name}.{" "}
          </>
        )}
        {current.note}
      </p>
    </div>
  );
}
