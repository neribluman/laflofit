export type LeaderRow = {
  id: string;
  name: string;
  emoji: string;
  ratio: number;
  detail: string;
  isMe: boolean;
};

/**
 * Emphasis form: one hue for you, grey for everyone else. Every bar is
 * direct-labelled, so nothing depends on telling two colours apart.
 */
export default function LeaderBars({ rows }: { rows: LeaderRow[] }) {
  return (
    <ol className="space-y-2.5">
      {rows.map((row, i) => (
        <li key={row.id} title={row.detail}>
          <div className="flex items-baseline gap-2 text-sm">
            <span className="w-4 shrink-0 nums text-xs text-muted">{i + 1}</span>
            <span aria-hidden>{row.emoji}</span>
            <span
              className={`min-w-0 flex-1 truncate ${
                row.isMe ? "font-semibold" : ""
              }`}
            >
              {row.name}
              {row.isMe && <span className="text-muted"> (you)</span>}
            </span>
            <span className="nums shrink-0 font-semibold">
              {Math.round(row.ratio * 100)}%
            </span>
          </div>
          <div className="mt-1 ml-6 h-2 overflow-hidden rounded-full bg-track">
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{
                width: `${Math.max(2, row.ratio * 100)}%`,
                background: row.isMe ? "var(--series)" : "var(--series-muted)",
              }}
            />
          </div>
          <p className="mt-1 ml-6 text-xs text-muted">{row.detail}</p>
        </li>
      ))}
    </ol>
  );
}
