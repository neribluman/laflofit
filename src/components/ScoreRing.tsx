/**
 * A meter: one ratio against its limit, on a same-hue track.
 * Deliberately not a pie — there is only ever one number here.
 */
export default function ScoreRing({
  ratio,
  label,
  size = 92,
}: {
  ratio: number;
  label: string;
  size?: number;
}) {
  const stroke = 9;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, ratio));

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--track)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--series)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped)}
          style={{ transition: "stroke-dashoffset .45s cubic-bezier(.2,.8,.3,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="nums text-xl font-bold leading-none">
          {Math.round(clamped * 100)}%
        </span>
        <span className="mt-0.5 text-[10px] font-medium text-muted">{label}</span>
      </div>
    </div>
  );
}
