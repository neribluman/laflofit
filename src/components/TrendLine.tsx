"use client";

import { useRef, useState } from "react";

export type Point = { date: string; value: number };

const W = 320;
const H = 140;
const PAD = { top: 12, right: 8, bottom: 20, left: 34 };

/**
 * One series over time. No legend — the title names it. The last point is
 * direct-labelled; everything else is on hover.
 *
 * Dates are formatted in here rather than via a prop: a Server Component
 * cannot hand a function across to the client.
 */
function formatDate(iso: string) {
  return iso.slice(5).replace("-", "/");
}

export default function TrendLine({
  points,
  unit,
}: {
  points: Point[];
  unit: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  if (points.length < 2) return null;

  const values = points.map((p) => p.value);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const span = rawMax - rawMin || 1;
  const min = rawMin - span * 0.15;
  const max = rawMax + span * 0.15;

  const x = (i: number) =>
    PAD.left +
    (i / (points.length - 1)) * (W - PAD.left - PAD.right);
  const y = (v: number) =>
    PAD.top + (1 - (v - min) / (max - min)) * (H - PAD.top - PAD.bottom);

  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i)} ${y(p.value)}`).join(" ");
  const area = `${path} L${x(points.length - 1)} ${H - PAD.bottom} L${x(0)} ${
    H - PAD.bottom
  } Z`;

  const ticks = [rawMax, (rawMax + rawMin) / 2, rawMin];
  const last = points[points.length - 1];
  const active = hover ?? points.length - 1;

  const onMove = (clientX: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const rel = ((clientX - rect.left) / rect.width) * W;
    const t =
      (rel - PAD.left) / Math.max(1, W - PAD.left - PAD.right);
    setHover(
      Math.max(0, Math.min(points.length - 1, Math.round(t * (points.length - 1)))),
    );
  };

  return (
    <figure className="m-0">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none"
        role="img"
        aria-label={`Trend from ${formatDate(points[0].date)} to ${formatDate(
          last.date,
        )}, latest ${last.value.toFixed(1)} ${unit}`}
        onPointerMove={(e) => onMove(e.clientX)}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--series)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--series)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(t)}
              y2={y(t)}
              stroke="var(--line)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={PAD.left - 6}
              y={y(t) + 3}
              textAnchor="end"
              className="nums"
              fill="var(--muted)"
              fontSize="8"
            >
              {t.toFixed(1)}
            </text>
          </g>
        ))}

        <path d={area} fill="url(#trendFill)" />
        <path
          d={path}
          fill="none"
          stroke="var(--series)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />

        <line
          x1={x(active)}
          x2={x(active)}
          y1={PAD.top}
          y2={H - PAD.bottom}
          stroke="var(--muted)"
          strokeWidth="1"
          strokeDasharray="3 3"
          vectorEffect="non-scaling-stroke"
          opacity={hover === null ? 0 : 0.6}
        />
        <circle
          cx={x(active)}
          cy={y(points[active].value)}
          r="4.5"
          fill="var(--series)"
          stroke="var(--surface)"
          strokeWidth="2"
        />

        <text
          x={PAD.left}
          y={H - 6}
          fill="var(--muted)"
          fontSize="8"
          className="nums"
        >
          {formatDate(points[0].date)}
        </text>
        <text
          x={W - PAD.right}
          y={H - 6}
          textAnchor="end"
          fill="var(--muted)"
          fontSize="8"
          className="nums"
        >
          {formatDate(last.date)}
        </text>
      </svg>

      <figcaption className="nums mt-1 text-center text-xs text-muted">
        {formatDate(points[active].date)} ·{" "}
        <span className="font-semibold text-text">
          {points[active].value.toFixed(1)} {unit}
        </span>
      </figcaption>
    </figure>
  );
}
