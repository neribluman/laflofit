"use client";

import { useState, useTransition } from "react";
import { setDayNote } from "../actions";

export default function DayNote({
  date,
  initial,
}: {
  date: string;
  initial: string;
}) {
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [, startTransition] = useTransition();

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="label">How did it go?</p>
        {saved && <span className="text-xs text-accent">Saved</span>}
      </div>
      <textarea
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setSaved(false);
        }}
        onBlur={() => {
          if (value === initial) return;
          startTransition(async () => {
            await setDayNote(date, value);
            setSaved(true);
          });
        }}
        rows={2}
        maxLength={500}
        placeholder="Optional. Your crew can see this."
        className="field resize-none"
      />
    </div>
  );
}
