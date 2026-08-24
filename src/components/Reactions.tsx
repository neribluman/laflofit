"use client";

import { useState, useTransition } from "react";
import { toggleReaction } from "@/app/(app)/actions";
import { CHEER_EMOJI } from "@/lib/presets";

export default function Reactions({
  targetType,
  targetId,
  counts,
  mine,
}: {
  targetType: string;
  targetId: string;
  counts: Record<string, number>;
  mine: string[];
}) {
  const [open, setOpen] = useState(false);
  const [local, setLocal] = useState({ counts, mine });
  const [, startTransition] = useTransition();

  const fire = (emoji: string) => {
    const has = local.mine.includes(emoji);
    setLocal((prev) => ({
      counts: {
        ...prev.counts,
        [emoji]: Math.max(0, (prev.counts[emoji] ?? 0) + (has ? -1 : 1)),
      },
      mine: has ? prev.mine.filter((e) => e !== emoji) : [...prev.mine, emoji],
    }));
    setOpen(false);
    startTransition(async () => {
      await toggleReaction(targetType, targetId, emoji);
    });
  };

  const active = Object.entries(local.counts).filter(([, n]) => n > 0);

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {active.map(([emoji, n]) => (
        <button
          key={emoji}
          onClick={() => fire(emoji)}
          className={`chip nums transition ${
            local.mine.includes(emoji) ? "border-accent text-text" : ""
          }`}
        >
          {emoji} {n}
        </button>
      ))}
      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label="Add a reaction"
          aria-expanded={open}
          className="chip hover:text-text"
        >
          ＋
        </button>
        {open && (
          <div className="absolute bottom-full left-0 z-10 mb-1 flex gap-1 rounded-xl border border-line bg-surface p-1.5 shadow-lg">
            {CHEER_EMOJI.map((emoji) => (
              <button
                key={emoji}
                onClick={() => fire(emoji)}
                className="rounded-lg px-1.5 py-1 text-lg hover:bg-surface-2"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
