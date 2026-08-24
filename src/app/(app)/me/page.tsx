import Link from "next/link";
import { redirect } from "next/navigation";
import {
  crewById,
  currentUser,
  dayLogsBetween,
  entriesForLogs,
  measurementsFor,
  planWithRules,
  workoutsBetween,
} from "@/lib/data";
import { addDays, todayIn } from "@/lib/dates";
import { bestStreak, currentStreak, scoreDay } from "@/lib/scoring";
import { fmtWeight, kgToDisplay, weightUnit } from "@/lib/units";
import TrendLine from "@/components/TrendLine";
import { signOut, updateProfile } from "../actions";
import SubmitButton from "@/components/SubmitButton";

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-3.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
        {label}
      </p>
      <p className="nums mt-1 text-xl font-bold">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}

export default async function MePage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  const today = todayIn(user.timezone);
  const from = addDays(today, -89);

  const planned = user.active_plan_id
    ? await planWithRules(user.active_plan_id)
    : null;
  const rules = planned?.rules ?? [];

  const [crew, logs, workouts, measurements] = await Promise.all([
    crewById(user.crew_id),
    dayLogsBetween([user.id], from, today),
    workoutsBetween([user.id], from, today),
    measurementsFor([user.id]),
  ]);

  const entries = await entriesForLogs(logs.map((l) => l.id));
  const entriesByLog = new Map<string, typeof entries>();
  for (const e of entries) {
    entriesByLog.set(e.day_log_id, [...(entriesByLog.get(e.day_log_id) ?? []), e]);
  }

  const perfectByDate = new Map<string, boolean>();
  const perfectDates: string[] = [];
  for (const log of logs) {
    const score = scoreDay(rules, entriesByLog.get(log.id) ?? [], true);
    perfectByDate.set(log.log_date, score.perfect);
    if (score.perfect) perfectDates.push(log.log_date);
  }

  const monthAgo = addDays(today, -29);
  const loggedThisMonth = logs.filter((l) => l.log_date >= monthAgo).length;
  const workoutsThisMonth = workouts.filter((w) => w.workout_date >= monthAgo).length;
  const minutesThisMonth = workouts
    .filter((w) => w.workout_date >= monthAgo)
    .reduce((sum, w) => sum + (w.minutes ?? 0), 0);

  const weights = measurements.filter((m) => m.weight_kg != null);
  const points = weights.map((m) => ({
    date: m.measured_on,
    value: kgToDisplay(m.weight_kg!, user.units),
  }));
  const deltaKg =
    weights.length >= 2
      ? weights[weights.length - 1].weight_kg! - weights[0].weight_kg!
      : null;

  return (
    <main className="space-y-8">
      <header className="flex items-center gap-3">
        <span className="text-3xl">{user.emoji}</span>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold tracking-tight">
            {user.display_name}
          </h1>
          <p className="truncate text-sm text-muted">{crew?.name}</p>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-2.5">
        <Stat
          label="Current"
          value={fmtWeight(weights.at(-1)?.weight_kg ?? null, user.units)}
          sub={
            deltaKg != null
              ? `${deltaKg > 0 ? "+" : ""}${kgToDisplay(deltaKg, user.units).toFixed(1)} ${weightUnit(user.units)} since you started`
              : "Log a second weigh-in for a trend"
          }
        />
        <Stat
          label="Streak"
          value={`${currentStreak(today, perfectByDate)} d`}
          sub={`Best: ${bestStreak(perfectDates)} days`}
        />
        <Stat
          label="Days logged"
          value={`${loggedThisMonth}/30`}
          sub="Last 30 days"
        />
        <Stat
          label="Workouts"
          value={String(workoutsThisMonth)}
          sub={minutesThisMonth > 0 ? `${minutesThisMonth} min total` : "Last 30 days"}
        />
      </section>

      {points.length >= 2 && (
        <section>
          <h2 className="label">Weight ({weightUnit(user.units)})</h2>
          <div className="card p-3">
            <TrendLine
              points={points}
              unit={weightUnit(user.units)}
            />
          </div>
        </section>
      )}

      <section>
        <h2 className="label">Your plan</h2>
        <Link href="/plan" className="card flex items-center gap-3 p-4 hover:border-muted">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">
              {planned?.plan.name ?? "No plan"}
            </p>
            <p className="text-xs text-muted">
              {rules.length} rule{rules.length === 1 ? "" : "s"} · tap to edit or
              switch
            </p>
          </div>
          <span className="text-muted">→</span>
        </Link>
      </section>

      <section>
        <h2 className="label">Settings</h2>
        <form action={updateProfile} className="card space-y-4 p-4">
          <div>
            <label className="label" htmlFor="display_name">
              Name
            </label>
            <input
              id="display_name"
              name="display_name"
              defaultValue={user.display_name}
              maxLength={40}
              required
              className="field"
            />
          </div>
          <div>
            <label className="label" htmlFor="emoji">
              Your mark
            </label>
            <input
              id="emoji"
              name="emoji"
              defaultValue={user.emoji}
              maxLength={8}
              className="field w-20 text-center text-xl"
            />
          </div>
          <div>
            <p className="label">Units</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { v: "metric", l: "kg / cm" },
                { v: "imperial", l: "lb / in" },
              ].map((o) => (
                <label
                  key={o.v}
                  className="flex cursor-pointer items-center justify-center rounded-xl border border-line bg-surface-2 py-2.5 text-sm font-medium
                             has-checked:border-accent has-checked:bg-accent/15"
                >
                  <input
                    type="radio"
                    name="units"
                    value={o.v}
                    defaultChecked={user.units === o.v}
                    className="sr-only"
                  />
                  {o.l}
                </label>
              ))}
            </div>
          </div>
          <SubmitButton>Save settings</SubmitButton>
        </form>
      </section>

      <form action={signOut}>
        <button className="btn-quiet w-full">Sign out</button>
      </form>
    </main>
  );
}
