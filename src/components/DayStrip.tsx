import Link from "next/link";
import { addDays, weekdayLetter } from "@/lib/dates";

export type StripDay = {
  date: string;
  ratio: number;
  logged: boolean;
  perfect: boolean;
};

export type PeriodTotals = {
  daysLogged: number;
  averageScore: number;
  averageCalories: number | null;
  averageProtein: number | null;
};

/**
 * Seven days with the one you're on in the middle — three either side, so the
 * days around it are reachable in a tap without a calendar taking the whole
 * screen. Fixed height: this sits above the thing you actually came to do.
 */
export default function DayStrip({
  days,
  selected,
  today,
  totals,
  totalsLabel,
  /** Which page the days link back to. The crew tab reuses this strip. */
  hrefBase = "/today",
  /** Shown instead of the totals row when there are no per-day totals. */
  note,
  earliest,
}: {
  days: StripDay[];
  selected: string;
  today: string;
  totals?: PeriodTotals;
  totalsLabel?: string;
  hrefBase?: string;
  note?: string;
  /** Oldest day the page will accept. Earlier ones are shown but inert. */
  earliest?: string;
}) {
  const byDate = new Map(days.map((day) => [day.date, day]));
  const window = Array.from({ length: 7 }, (_, i) => addDays(selected, i - 3));

  return (
    <div className="card p-3">
      <ol className="flex gap-1">
        {window.map((date) => {
          const day = byDate.get(date);
          const isSelected = date === selected;
          const isToday = date === today;
          // "Out of range" either way: a day that hasn't happened, or one
          // older than the page loads. Both would bounce back to today.
          const future = date > today || (earliest ? date < earliest : false);

          return (
            <li key={date} className="flex-1">
              <Link
                href={future ? "#" : `${hrefBase}?d=${date}`}
                aria-disabled={future}
                aria-current={isSelected ? "date" : undefined}
                aria-label={`${date}: ${
                  day?.logged ? `${Math.round(day.ratio * 100)} percent` : "not logged"
                }`}
                className={`flex flex-col items-center gap-1 rounded-xl py-1.5 transition ${
                  future ? "pointer-events-none opacity-30" : "hover:bg-surface-2"
                } ${isSelected ? "bg-surface-2 ring-1 ring-accent" : ""}`}
              >
                <span
                  className={`text-[10px] font-medium ${
                    isToday ? "text-accent" : "text-muted"
                  }`}
                >
                  {weekdayLetter(date)}
                </span>
                <span
                  className="nums flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold"
                  style={{
                    background: day?.logged
                      ? `color-mix(in srgb, var(--series) ${Math.round(
                          18 + day.ratio * 82,
                        )}%, transparent)`
                      : "transparent",
                    border: day?.logged ? "none" : "1.5px dashed var(--track)",
                    color:
                      day?.logged && day.ratio > 0.55
                        ? "var(--accent-ink)"
                        : "var(--text)",
                  }}
                >
                  {day?.perfect ? "✓" : day?.logged ? Math.round(day.ratio * 100) : Number(date.slice(-2))}
                </span>
                {/* A dot only under today, so the day you're on and the day it
                    actually is are never the same signal. */}
                <span
                  aria-hidden
                  className={`h-1 w-1 rounded-full ${isToday ? "bg-accent" : "bg-transparent"}`}
                />
              </Link>
            </li>
          );
        })}
      </ol>

      {note && (
        <p className="mt-2 border-t border-line pt-2 text-xs text-muted">{note}</p>
      )}

      {totals && (
      <dl className="mt-2 flex items-baseline justify-between gap-2 border-t border-line pt-2 text-xs">
        <dt className="text-muted">{totalsLabel}</dt>
        <dd className="nums flex gap-3 font-medium">
          <span>
            {totals.daysLogged} <span className="font-normal text-muted">logged</span>
          </span>
          <span>
            {totals.daysLogged ? totals.averageScore : "—"}{" "}
            <span className="font-normal text-muted">avg</span>
          </span>
          {totals.averageCalories != null && (
            <span>
              {totals.averageCalories.toLocaleString()}{" "}
              <span className="font-normal text-muted">kcal</span>
            </span>
          )}
          {totals.averageProtein != null && (
            <span>
              {totals.averageProtein}
              <span className="font-normal text-muted">g P</span>
            </span>
          )}
        </dd>
      </dl>
      )}
    </div>
  );
}
