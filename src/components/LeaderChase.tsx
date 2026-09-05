"use client";

import { useEffect, useRef, useState } from "react";

export type Chaser = {
  id: string;
  name: string;
  emoji: string;
  hasAvatar: boolean;
  /** How far ahead they are, already phrased. */
  lead: string;
};

/**
 * The week's leader, drifting across the screen and bouncing off the edges.
 *
 * The point is to be mildly irritating, so the rules that keep it *mildly*
 * are the whole design:
 *
 * - It only appears when someone else is ahead. Your own face is not a taunt.
 * - It stops the moment you log today. The irritation is tied to the thing it
 *   wants you to do, so doing it is the way out — not hunting for a setting.
 * - It never blocks a tap. Only the face itself is clickable; everything
 *   around it is inert, so it can't swallow a button it happens to be over.
 * - Tapping it says how far ahead they are and sends it away until tomorrow.
 * - Reduced motion means no drifting at all: it sits still in a corner. A
 *   thing crawling across the screen is a migraine trigger for some people,
 *   and "almost annoying" has to stay a joke rather than a symptom.
 *
 * No animation library: this is position += velocity with edge collisions,
 * which is thirty lines and no kilobytes. Motion is 46KB gzipped and earns
 * that on layout animations and gestures, neither of which is happening here.
 */
export default function LeaderChase({ leader }: { leader: Chaser }) {
  const [gone, setGone] = useState(true);
  const [caught, setCaught] = useState(false);
  const [corner, setCorner] = useState(false);
  const [still, setStill] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // Dismissed for the rest of today, per browser. sessionStorage would forget
  // on every reload, and forever would make it pointless.
  useEffect(() => {
    // On the next frame rather than during the effect: the page paints once
    // without this, which is right for a decoration, and it keeps the state
    // change out of the render that mounted it.
    const id = requestAnimationFrame(() => {
      const today = new Date().toISOString().slice(0, 10);
      try {
        if (localStorage.getItem("laflofit:chase-dismissed") === today) return;
      } catch {
        // Private windows throw on access; a joke is not worth an error.
      }
      setStill(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
      setGone(false);
    });
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (gone || still) return;
    const node = box.current;
    if (!node) return;

    const size = 64;
    // Slow. A fast one reads as a bug, and reads as hostile rather than funny.
    let x = Math.random() * Math.max(1, window.innerWidth - size);
    let y = window.innerHeight * (0.25 + Math.random() * 0.4);
    let dx = (Math.random() < 0.5 ? -1 : 1) * 42;
    let dy = (Math.random() < 0.5 ? -1 : 1) * 34;
    let last = performance.now();
    let frame = 0;

    const step = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      // Kept inside the safe area: clear of the status bar at the top and the
      // nav bar at the bottom, so it never sits on top of a tab.
      const left = 8;
      const right = window.innerWidth - size - 8;
      const top = 72;
      const bottom = window.innerHeight - size - 96;

      x += dx * dt;
      y += dy * dt;

      let hitX = false;
      let hitY = false;
      if (x <= left) {
        x = left;
        dx = Math.abs(dx);
        hitX = true;
      } else if (x >= right) {
        x = right;
        dx = -Math.abs(dx);
        hitX = true;
      }
      if (y <= top) {
        y = top;
        dy = Math.abs(dy);
        hitY = true;
      } else if (y >= bottom) {
        y = bottom;
        dy = -Math.abs(dy);
        hitY = true;
      }

      // The DVD-logo corner. Rare, worth marking, and the entire reason this
      // shape of animation is funny to anyone who grew up with a DVD player.
      if (hitX && hitY) {
        setCorner(true);
        setTimeout(() => setCorner(false), 2600);
      }

      node.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
      frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [gone, still]);

  const dismiss = () => {
    if (!caught) {
      setCaught(true);
      return;
    }
    try {
      localStorage.setItem("laflofit:chase-dismissed", new Date().toISOString().slice(0, 10));
    } catch {
      // Nothing to do; it just returns on the next page load.
    }
    setGone(true);
  };

  if (gone) return null;

  return (
    <div
      ref={box}
      // The wrapper spans nothing and catches nothing; only the button below
      // is interactive, so this can drift over a form without eating taps.
      className="pointer-events-none fixed top-0 left-0 z-30"
      style={still ? { transform: "translate3d(calc(100vw - 88px), calc(100dvh - 176px), 0)" } : undefined}
    >
      <button
        onClick={dismiss}
        aria-label={
          caught
            ? `Dismiss until tomorrow. ${leader.name} is ${leader.lead}`
            : `${leader.name} is leading this week`
        }
        className="pointer-events-auto relative block cursor-pointer"
      >
        {leader.hasAvatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/avatar/${leader.id}`}
            alt=""
            width={64}
            height={64}
            className={`h-16 w-16 rounded-full bg-surface-2 object-cover shadow-lg ring-2 transition-transform ${
              corner ? "scale-125 ring-warn" : "ring-accent"
            }`}
          />
        ) : (
          <span
            aria-hidden
            className={`flex h-16 w-16 items-center justify-center rounded-full bg-surface-2 text-3xl shadow-lg ring-2 ${
              corner ? "scale-125 ring-warn" : "ring-accent"
            }`}
          >
            {leader.emoji}
          </span>
        )}

        {/* A crown, so it reads as "leader" and not "notification". */}
        <span aria-hidden className="absolute -top-1.5 -right-1 text-lg drop-shadow">
          {corner ? "🎉" : "👑"}
        </span>

        {(caught || corner) && (
          <span className="card absolute top-1/2 right-[72px] w-max max-w-[52vw] -translate-y-1/2 px-3 py-2 text-left text-xs leading-snug shadow-lg">
            {corner ? (
              <>
                <span className="font-semibold">Corner hit.</span> Nobody saw it
                but you.
              </>
            ) : (
              <>
                <span className="font-semibold">{leader.name}</span> is {leader.lead}.
                <span className="mt-0.5 block text-muted">
                  Tap again and they&apos;ll leave you alone until tomorrow.
                </span>
              </>
            )}
          </span>
        )}
      </button>
    </div>
  );
}
