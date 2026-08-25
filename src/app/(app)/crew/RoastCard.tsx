"use client";

import { useEffect, useState } from "react";
import { ensureRoast } from "./roast-actions";
import type { Roast } from "@/lib/roast";
import Avatar from "@/components/Avatar";

export type RoastFace = {
  id: string;
  name: string;
  emoji: string;
  hasAvatar: boolean;
};

export default function RoastCard({ faces }: { faces: RoastFace[] }) {
  const [roast, setRoast] = useState<Roast | null>(null);
  const [failed, setFailed] = useState(false);

  // Reading a cached ruling is quick; writing a new one takes a few seconds.
  // Either way the page paints first and this fills in, rather than everyone
  // waiting on a joke to see the leaderboard.
  useEffect(() => {
    let live = true;
    ensureRoast()
      .then((result) => {
        if (!live) return;
        if (result) setRoast(result);
        else setFailed(true);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);

  if (failed) return null;

  const byName = new Map(faces.map((face) => [face.name, face]));

  return (
    <div className="card p-4">
      {!roast ? (
        <div className="space-y-2" aria-live="polite">
          <p className="text-sm text-muted">Reviewing the evidence…</p>
          {[92, 78, 84, 61].map((width, i) => (
            <div
              key={i}
              className="h-3 animate-pulse rounded bg-surface-2"
              style={{ width: `${width}%`, animationDelay: `${i * 140}ms` }}
            />
          ))}
        </div>
      ) : (
        <>
          <p className="text-sm leading-relaxed italic">{roast.verdict}</p>

          <ul className="mt-4 space-y-3 border-t border-line pt-4">
            {roast.lines.map((line) => {
              const face = byName.get(line.name);
              return (
                <li key={line.name} className="flex gap-2.5 text-sm">
                  {face ? (
                    <span className="mt-0.5 shrink-0">
                      <Avatar
                        user={{
                          id: face.id,
                          emoji: face.emoji,
                          display_name: face.name,
                          has_avatar: face.hasAvatar,
                        }}
                      />
                    </span>
                  ) : null}
                  <span className="min-w-0 flex-1 leading-relaxed">
                    <span className="font-semibold">{line.name}</span>{" "}
                    <span className="text-muted">{line.line}</span>
                  </span>
                </li>
              );
            })}
          </ul>

          <p className="mt-4 border-t border-line pt-3 text-xs text-muted italic">
            {roast.blessing}
          </p>
        </>
      )}
    </div>
  );
}
