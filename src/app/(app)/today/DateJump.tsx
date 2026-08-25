"use client";

import { useRouter } from "next/navigation";

/**
 * The date in the header is the control. A transparent date input sits over
 * it, so tapping opens the platform's own picker — no bespoke calendar, and
 * it works the same on a phone as on a desktop.
 */
export default function DateJump({
  date,
  today,
  label,
}: {
  date: string;
  today: string;
  label: string;
}) {
  const router = useRouter();

  return (
    <span className="relative inline-flex items-center">
      <span className="truncate text-base font-semibold">{label}</span>
      <svg
        viewBox="0 0 24 24"
        className="ml-1 h-4 w-4 shrink-0 text-muted"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
      <input
        type="date"
        value={date}
        max={today}
        onChange={(event) => {
          if (event.target.value) router.push(`/today?d=${event.target.value}`);
        }}
        aria-label="Jump to another day"
        className="absolute inset-0 cursor-pointer opacity-0"
      />
    </span>
  );
}
