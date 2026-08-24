import Link from "next/link";
import { weekdayLetter } from "@/lib/dates";

export type StripDay = { date: string; ratio: number; perfect: boolean; logged: boolean };

const R = 12.5;
const C = 2 * Math.PI * R;

/**
 * Seven days at a glance. A partial day is drawn as an arc around the number,
 * so the figure always sits on the page background and stays legible; only a
 * perfect day gets a solid fill, and it carries a tick as well as the colour.
 */
export default function WeekStrip({
  days,
  selected,
}: {
  days: StripDay[];
  selected?: string;
}) {
  return (
    <ol className="flex gap-1.5">
      {days.map((day) => {
        const isSelected = day.date === selected;
        return (
          <li key={day.date} className="flex-1">
            <Link
              href={`/today?d=${day.date}`}
              aria-label={`${day.date}: ${
                day.logged
                  ? `${Math.round(day.ratio * 100)} percent of rules met`
                  : "not logged"
              }`}
              className={`flex flex-col items-center gap-1 rounded-xl py-2 transition ${
                isSelected ? "bg-surface-2 ring-1 ring-line" : "hover:bg-surface-2"
              }`}
            >
              <span className="text-[10px] font-medium text-muted">
                {weekdayLetter(day.date)}
              </span>

              <span className="relative flex h-8 w-8 items-center justify-center">
                <svg viewBox="0 0 32 32" className="absolute inset-0 -rotate-90" aria-hidden>
                  <circle
                    cx="16"
                    cy="16"
                    r={R}
                    fill={day.perfect ? "var(--series)" : "none"}
                    stroke={day.logged ? "var(--track)" : "transparent"}
                    strokeWidth="3"
                    strokeDasharray={day.logged ? undefined : "3 3"}
                  />
                  {!day.logged && (
                    <circle
                      cx="16"
                      cy="16"
                      r={R}
                      fill="none"
                      stroke="var(--track)"
                      strokeWidth="1.5"
                      strokeDasharray="3 3"
                    />
                  )}
                  {day.logged && !day.perfect && (
                    <circle
                      cx="16"
                      cy="16"
                      r={R}
                      fill="none"
                      stroke="var(--series)"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeDasharray={C}
                      strokeDashoffset={C * (1 - Math.max(0.02, day.ratio))}
                    />
                  )}
                </svg>
                <span
                  className="nums relative text-[11px] font-bold"
                  style={{ color: day.perfect ? "var(--accent-ink)" : "var(--text)" }}
                >
                  {day.perfect ? "✓" : day.logged ? Math.round(day.ratio * 100) : ""}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
