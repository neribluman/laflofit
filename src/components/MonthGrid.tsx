import Link from "next/link";
import { monthDays, monthLabel, weekdayIndex } from "@/lib/dates";

export type MonthDay = {
  date: string;
  ratio: number;
  logged: boolean;
  perfect: boolean;
};

export type MonthTotals = {
  daysLogged: number;
  averageScore: number;
  averageCalories: number | null;
  averageProtein: number | null;
};

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted">
        {label}
      </dt>
      <dd className="nums mt-0.5 text-sm font-bold">{value}</dd>
    </div>
  );
}

/**
 * The month at a glance: one cell per day, darker for a better day, so a run
 * of good days and the gaps between them are both visible without reading a
 * single number. Tapping a day opens it.
 */
export default function MonthGrid({
  month,
  days,
  totals,
  selected,
  today,
  prevHref,
  nextHref,
}: {
  month: string;
  days: MonthDay[];
  totals: MonthTotals;
  selected: string;
  today: string;
  prevHref: string;
  nextHref: string | null;
}) {
  const byDate = new Map(days.map((day) => [day.date, day]));
  const dates = monthDays(month);
  const leading = weekdayIndex(dates[0]);

  return (
    <section className="card p-4">
      <header className="mb-3 flex items-center gap-2">
        <Link href={prevHref} aria-label="Previous month" className="btn-quiet px-2 py-1">
          ‹
        </Link>
        <h2 className="flex-1 text-center text-sm font-semibold">
          {monthLabel(month)}
        </h2>
        {nextHref ? (
          <Link href={nextHref} aria-label="Next month" className="btn-quiet px-2 py-1">
            ›
          </Link>
        ) : (
          <span className="px-2 py-1 opacity-0" aria-hidden>
            ›
          </span>
        )}
      </header>

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((letter, i) => (
          <span
            key={i}
            className="pb-1 text-center text-[10px] font-medium text-muted"
          >
            {letter}
          </span>
        ))}

        {Array.from({ length: leading }, (_, i) => (
          <span key={`pad${i}`} />
        ))}

        {dates.map((date) => {
          const day = byDate.get(date);
          const isSelected = date === selected;
          const isToday = date === today;
          const future = date > today;

          return (
            <Link
              key={date}
              href={`/today?d=${date}`}
              aria-label={`${date}: ${
                day?.logged ? `${Math.round(day.ratio * 100)} percent` : "not logged"
              }`}
              aria-current={isSelected ? "date" : undefined}
              className={`flex aspect-square items-center justify-center rounded-lg text-[11px] font-semibold transition ${
                future ? "pointer-events-none opacity-25" : ""
              } ${isSelected ? "ring-2 ring-accent" : ""}`}
              style={{
                background: day?.logged
                  ? `color-mix(in srgb, var(--series) ${Math.round(
                      18 + day.ratio * 82,
                    )}%, transparent)`
                  : "transparent",
                border: day?.logged
                  ? "none"
                  : `1.5px ${isToday ? "solid var(--muted)" : "dashed var(--track)"}`,
                color:
                  day?.logged && day.ratio > 0.55 ? "var(--accent-ink)" : "var(--text)",
              }}
            >
              {day?.perfect ? "✓" : Number(date.slice(-2))}
            </Link>
          );
        })}
      </div>

      <dl className="mt-4 grid grid-cols-4 gap-2 border-t border-line pt-3">
        <Stat label="Logged" value={`${totals.daysLogged}`} />
        <Stat
          label="Avg score"
          value={totals.daysLogged ? `${totals.averageScore}` : "—"}
        />
        <Stat
          label="Avg kcal"
          value={totals.averageCalories ? totals.averageCalories.toLocaleString() : "—"}
        />
        <Stat
          label="Avg protein"
          value={totals.averageProtein ? `${totals.averageProtein}g` : "—"}
        />
      </dl>
    </section>
  );
}
