"use client";

import { useEffect, useState } from "react";
import { weekdayLetter } from "@/lib/dates";
import type { WeekStanding } from "@/lib/scoring";
import type { BoardEntry, BoardKey } from "@/lib/boards";
import Avatar from "./Avatar";
import { ensureRoast } from "@/app/(app)/crew/roast-actions";
import type { Roast } from "@/lib/roast";

export type LeaderRow = {
  id: string;
  name: string;
  emoji: string;
  hasAvatar: boolean;
  isMe: boolean;
  /** 1 on the day they joined — they can't have skipped days that predate them. */
  daysInCrew: number;
  standing: WeekStanding;
  boards: Record<BoardKey, BoardEntry>;
  /** The same five boards, for the one selected day. */
  dayBoards: Record<BoardKey, BoardEntry>;
};

const MEDALS = ["🥇", "🥈", "🥉"];

/** "Gidi, DADDY and Amir" — a list people would actually say out loud. */
const listOf = (names: string[]) =>
  names.length <= 1
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

const BOARDS: { key: BoardKey; tab: string; note: string; dayNote?: string }[] = [
  {
    key: "overall",
    tab: "Overall",
    note: "Not one score — how you placed across five contests, added up. Each one gives you a point for entering and a point for everyone you finish ahead of, so winning a contest five people entered counts for more than winning one that two did. Your own plan is one contest among them, because a six-rule plan and a calorie target are different exams and comparing their percentages proved nothing. Tap a row for the full breakdown.",
    dayNote: "How you placed across five contests on this day, added up: a point for entering each, and a point for everyone you finish ahead of. Tap a row to see which contests you scored in.",
  },
  {
    key: "plan",
    tab: "Plan",
    note: "Clean days out of seven. Follow a day completely and it counts as one; half-follow it and it counts as half; never log it and it counts as nothing.",
    dayNote: "How much of your plan you kept on this one day, out of 100. Whoever comes first among the people who logged takes it — turning up when nobody else did still counts.",
  },
  {
    key: "training",
    tab: "Training",
    note: "Days you trained this week — a class, a walk and a lifting day each count once. Minutes aren't the measure: free text rarely says how long a gym session took, and counting them would put the lifters last.",
    dayNote: "Sessions logged on this day. Ties break on minutes, but sessions come first — a lifting session rarely says how long it took.",
  },
  {
    key: "protein",
    tab: "Protein",
    note: "Grams of protein per kilo of bodyweight, averaged over the days you logged food. Most strength plans aim somewhere between 1.6 and 2.2.",
    dayNote: "Grams of protein per kilo of bodyweight on this day. Most strength plans aim between 1.6 and 2.2.",
  },
  {
    key: "calories",
    tab: "Calories",
    note: "How close you stayed to the target that gets you to your goal weight — maintenance less a deficit if you want to lose, maintenance if you're holding. Eating under counts against you as much as eating over. Tap a row to see where that number came from.",
    dayNote: "How close this one day's eating came to the target that gets you to your goal weight. 100 is dead on; over and under cost the same. Tap a row for where the target came from.",
  },
  {
    key: "strength",
    tab: "Strength",
    note: "Your best estimated single on squat, bench, deadlift and overhead press, added together and divided by your bodyweight.",
    dayNote: "Estimated singles on squat, bench, deadlift and overhead press from this day's lifts, divided by bodyweight.",
  },
];

export default function Leaderboard({
  rows,
  roastable = false,
  dayLabel = "Today",
}: {
  rows: LeaderRow[];
  roastable?: boolean;
  /** Which day the day view is showing — follows the strip above. */
  dayLabel?: string;
}) {
  // A day is what people actually want to know about; the week is the argument
  // they settle on Sunday. So the day leads.
  const [period, setPeriod] = useState<"day" | "week">("day");
  const [board, setBoard] = useState<BoardKey>("overall");
  const [open, setOpen] = useState<string | null>(null);
  const [roast, setRoast] = useState<Roast | null>(null);
  const [explaining, setExplaining] = useState<string | null>(null);

  // Fetched after paint. The numbers are the page; the ribbing arrives a beat
  // later, which is roughly how it works in person too.
  useEffect(() => {
    if (!roastable) return;
    let live = true;
    ensureRoast()
      .then((result) => live && result && setRoast(result))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [roastable]);

  const quips = new Map((roast?.lines ?? []).map((line) => [line.name, line.line]));

  const current = BOARDS.find((b) => b.key === board)!;
  const isDay = period === "day";
  const entryFor = (row: LeaderRow) =>
    isDay ? row.dayBoards[board] : row.boards[board];

  const ranked = [...rows].sort((a, b) => {
    const left = entryFor(a);
    const right = entryFor(b);
    if (left.missing !== right.missing) return left.missing ? 1 : -1;
    return right.value - left.value;
  });

  const scored = ranked.filter((row) => !entryFor(row).missing);

  // Competition ranking — equal scores take the same place, and the next
  // distinct score picks up after them. 1, 2, 2, 4.
  const ranks = scored.map(
    (row) => scored.findIndex((other) => entryFor(other).value === entryFor(row).value) + 1,
  );
  const absent = ranked.filter((row) => entryFor(row).missing);
  const best = Math.max(...scored.map((row) => entryFor(row).value), 0.0001);

  // Everyone left out for the same reason gets one line between them.
  const sidelined = [...
    absent.reduce((groups, row) => {
      const why = entryFor(row).detail;
      return groups.set(why, [...(groups.get(why) ?? []), row.name]);
    }, new Map<string, string[]>()),
  ];

  const me = rows.find((row) => row.isMe);
  const leader = scored[0];
  const gap =
    board === "overall" && me && leader && me.id !== leader.id
      ? entryFor(leader).value - entryFor(me).value
      : 0;

  return (
    <div className="card p-4">
      <div className="mb-3 flex gap-1 rounded-xl bg-surface-2 p-1">
        {(
          [
            ["day", dayLabel],
            ["week", "This week"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            onClick={() => {
              setPeriod(value);
              setExplaining(null);
              setOpen(null);
            }}
            aria-pressed={period === value}
            className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition ${
              period === value ? "bg-surface text-text shadow-sm" : "text-muted"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mb-4 grid grid-cols-6 gap-1 rounded-xl bg-surface-2 p-1">
        {BOARDS.map((option) => (
          <button
            key={option.key}
            onClick={() => {
              setBoard(option.key);
              setExplaining(null);
            }}
            aria-pressed={board === option.key}
            className={`rounded-lg py-1.5 text-[10px] font-semibold transition ${
              board === option.key ? "bg-accent text-accent-ink" : "text-muted"
            }`}
          >
            {option.tab}
          </button>
        ))}
      </div>

      {roast && !isDay && board === "overall" && (
        <p className="mb-4 text-center text-xs text-muted italic">
          {roast.verdict}
        </p>
      )}

      <ol className="space-y-3">
        {scored.map((row, i) => {
          const entry = entryFor(row);
          const expandable = !isDay && board === "plan";
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
                    ) : ranks[i] <= 3 ? (
                      MEDALS[ranks[i] - 1]
                    ) : (
                      <span className="nums text-xs text-muted">{ranks[i]}</span>
                    )}
                  </span>
                  <Avatar
                    user={{
                      id: row.id,
                      emoji: row.emoji,
                      display_name: row.name,
                      has_avatar: row.hasAvatar,
                    }}
                  />
                  <span
                    className={`min-w-0 flex-1 truncate ${row.isMe ? "font-semibold" : ""} ${
                      entry.missing ? "text-muted" : ""
                    }`}
                  >
                    {row.name}
                    {row.isMe && <span className="text-muted"> (you)</span>}
                  </span>
                  {!isDay && board === "plan" && row.standing.streak > 0 && (
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
                  {!isDay && board === "plan"
                    ? row.standing.daysLogged === 0
                      ? row.daysInCrew <= 1
                        ? "joined today · nothing logged yet"
                        : "nothing logged yet"
                      : `${row.standing.daysLogged} day${row.standing.daysLogged === 1 ? "" : "s"} logged · ${row.standing.average}% of plan${
                          row.standing.perfectDays > 0
                            ? ` · ${row.standing.perfectDays} perfect`
                            : ""
                        }${row.standing.loggedToday ? "" : " · not today"}${
                          // Only when it explains something. Logging more days
                          // than you have been a member — imported history, a
                          // rejoin — makes "joined 2 days ago" read as a
                          // contradiction sitting next to "5 days logged".
                          row.daysInCrew < 7 &&
                          row.standing.daysLogged <= row.daysInCrew
                            ? row.daysInCrew <= 1
                              ? " · joined today"
                              : ` · joined ${row.daysInCrew} days ago`
                            : ""
                        }`
                    : entry.detail}
                </p>

                {!isDay && board === "overall" && quips.has(row.name) && (
                  <p className="mt-0.5 ml-7 text-xs text-text italic">
                    {quips.get(row.name)}
                  </p>
                )}
              </button>

              {entry.explain && (
                <div className="ml-7">
                  <button
                    onClick={() => setExplaining(explaining === row.id ? null : row.id)}
                    aria-expanded={explaining === row.id}
                    title={entry.explain}
                    className="text-xs text-muted underline decoration-dotted underline-offset-2"
                  >
                    {explaining === row.id ? "Hide" : "Where's that from?"}
                  </button>
                  {explaining === row.id && (
                    <p className="mt-1 rounded-lg bg-surface-2 px-2.5 py-2 text-xs leading-relaxed whitespace-pre-line text-muted">
                      {entry.explain}
                    </p>
                  )}
                </div>
              )}

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

      {scored.length === 0 && (
        <p className="py-2 text-sm text-muted">
          Nobody has logged enough for this one yet.
        </p>
      )}

      {sidelined.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-line pt-3">
          {sidelined.map(([why, names]) => (
            <li key={why} className="text-xs text-muted">
              <span className="text-text">{listOf(names)}</span> — {why}.
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 border-t border-line pt-3 text-xs text-muted">
        {gap > 0 && (
          <>
            <span className="nums font-semibold text-text">{gap} point{gap === 1 ? "" : "s"}</span> behind{" "}
            {leader.name}.{" "}
          </>
        )}
        {isDay ? (current.dayNote ?? current.note) : current.note}
      </p>
    </div>
  );
}
