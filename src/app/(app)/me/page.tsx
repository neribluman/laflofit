import Link from "next/link";
import { redirect } from "next/navigation";
import {
  crewById,
  currentUser,
  dayLogsBetween,
  entriesForLogs,
  exercisesForWorkouts,
  measurementsFor,
  planWithRules,
  workoutsBetween,
} from "@/lib/data";
import { addDays, prettyDate, todayIn } from "@/lib/dates";
import { bestStreak, currentStreak, scoreDay } from "@/lib/scoring";
import { missingForEnergy } from "@/lib/profile";
import { describeExercise } from "@/lib/exercise-format";
import {
  cmToDisplay,
  distanceUnit,
  fmtWeight,
  kgToDisplay,
  kmToDisplay,
  lengthUnit,
  weightUnit,
} from "@/lib/units";
import TrendLine from "@/components/TrendLine";
import { deleteMeasurement, deleteWorkout, signOut, updateProfile } from "../actions";
import SubmitButton from "@/components/SubmitButton";
import BiomarkerForm from "./BiomarkerForm";
import ProfileFields from "@/components/ProfileFields";
import BiomarkerGrid from "./BiomarkerGrid";

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
  const weight = weightUnit(user.units);
  const distance = distanceUnit(user.units);

  const planned = user.active_plan_id
    ? await planWithRules(user.active_plan_id)
    : null;
  const rules = planned?.rules ?? [];

  const [crew, logs, workouts, measurements] = await Promise.all([
    crewById(user.crew_id),
    dayLogsBetween([user.id], from, today),
    workoutsBetween([user.id], addDays(today, -20), today),
    measurementsFor([user.id]),
  ]);

  const [entries, exercises] = await Promise.all([
    entriesForLogs(logs.map((l) => l.id)),
    exercisesForWorkouts(workouts.map((w) => w.id)),
  ]);

  const entriesByLog = new Map<string, typeof entries>();
  for (const e of entries) {
    entriesByLog.set(e.day_log_id, [...(entriesByLog.get(e.day_log_id) ?? []), e]);
  }
  const byWorkout = new Map<string, typeof exercises>();
  for (const exercise of exercises) {
    byWorkout.set(exercise.workout_id, [
      ...(byWorkout.get(exercise.workout_id) ?? []),
      exercise,
    ]);
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
  const recent = [...measurements].reverse().slice(0, 8);

  // If the profile is short of something, don't make them find the form.
  const latestWeightKg =
    [...measurements].reverse().find((m) => m.weight_kg != null)?.weight_kg ?? null;
  const profileIncomplete =
    missingForEnergy(user, latestWeightKg, today).length > 0;

  return (
    <main className="mx-auto max-w-lg space-y-8 lg:max-w-2xl">
      <header className="flex items-center gap-3">
        <span className="text-3xl">{user.emoji}</span>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold tracking-tight">
            {user.display_name}
          </h1>
          <p className="truncate text-sm text-muted">{crew?.name}</p>
        </div>
      </header>

      <section className="space-y-2.5">
        <h2 className="label mb-0">Biomarkers</h2>
        <BiomarkerGrid measurements={measurements} user={user} today={today} />
        <BiomarkerForm
          date={today}
          units={user.units}
          knowsHeight={user.height_cm != null}
        />
      </section>

      {points.length >= 2 && (
        <section>
          <h2 className="label">Weight ({weight})</h2>
          <div className="card p-3">
            <TrendLine points={points} unit={weight} />
          </div>
        </section>
      )}

      {recent.length > 0 && (
        <section>
          <h2 className="label">Recent entries</h2>
          <ul className="card divide-y divide-line">
            {recent.map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <span className="flex-1 text-muted">
                  {prettyDate(m.measured_on, today)}
                </span>
                <span className="nums shrink-0 text-xs text-muted">
                  {[
                    m.weight_kg != null ? fmtWeight(m.weight_kg, user.units) : null,
                    m.body_fat != null ? `${m.body_fat}%` : null,
                    m.waist_cm != null
                      ? `${cmToDisplay(m.waist_cm, user.units).toFixed(1)} ${lengthUnit(user.units)}`
                      : null,
                    m.resting_hr != null ? `${m.resting_hr} bpm` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                <form action={deleteMeasurement.bind(null, m.id)}>
                  <button
                    className="btn-quiet px-1 py-1 text-xs"
                    aria-label={`Delete entry from ${m.measured_on}`}
                  >
                    Delete
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="label">Last 30 days</h2>
        <div className="grid grid-cols-2 gap-2.5">
          <Stat
            label="Streak"
            value={`${currentStreak(today, perfectByDate)} d`}
            sub={`Best: ${bestStreak(perfectDates)} days`}
          />
          <Stat label="Days logged" value={`${loggedThisMonth}/30`} />
          <Stat label="Workouts" value={String(workoutsThisMonth)} />
          <Stat
            label="Training time"
            value={`${minutesThisMonth} min`}
            sub={minutesThisMonth > 0 ? "across the month" : undefined}
          />
        </div>
      </section>

      <section>
        <h2 className="label">Training history</h2>
        {workouts.length === 0 ? (
          <p className="card p-4 text-sm text-muted">
            Nothing in the last three weeks. Log a session from{" "}
            <Link href="/today" className="font-medium text-accent">
              Today
            </Link>
            .
          </p>
        ) : (
          <ul className="space-y-2">
            {workouts.map((w) => {
              const moves = byWorkout.get(w.id) ?? [];
              return (
                <li key={w.id} className="card p-3.5">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {w.kind}
                        {w.minutes ? (
                          <span className="nums text-muted"> · {w.minutes} min</span>
                        ) : null}
                        <span className="text-muted"> · {w.intensity}</span>
                      </p>
                      <p className="text-xs text-muted">
                        {prettyDate(w.workout_date, today)}
                        {w.notes ? ` — ${w.notes}` : ""}
                      </p>
                    </div>
                    <form action={deleteWorkout.bind(null, w.id)}>
                      <button
                        className="btn-quiet px-2 py-1 text-xs"
                        aria-label={`Delete ${w.kind} on ${w.workout_date}`}
                      >
                        Delete
                      </button>
                    </form>
                  </div>
                  {moves.length > 0 && (
                    <ul className="mt-2 space-y-1 border-t border-line pt-2">
                      {moves.map((move) => (
                        <li key={move.id} className="flex gap-2 text-xs">
                          <span className="min-w-0 flex-1 truncate">{move.name}</span>
                          <span className="nums shrink-0 text-muted">
                            {describeExercise(
                              {
                                sets: move.sets,
                                reps: move.reps,
                                weight:
                                  move.weight_kg == null
                                    ? null
                                    : kgToDisplay(move.weight_kg, user.units),
                                distance:
                                  move.distance_km == null
                                    ? null
                                    : kmToDisplay(move.distance_km, user.units),
                                minutes: move.minutes,
                              },
                              weight,
                              distance,
                            ) || "—"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section id="about-you" className="scroll-mt-4">
        <h2 className="label">About you</h2>
        {user.about ? (
          <p className="card mb-2.5 p-4 text-sm">{user.about}</p>
        ) : (
          <p className="card mb-2.5 p-4 text-sm text-muted">
            Nothing on file yet. What you put here is read every time your day
            is analysed, so portions and effort are judged against you rather
            than an average person.
          </p>
        )}
        <details className="card p-4" open={profileIncomplete}>
          <summary className="cursor-pointer text-sm font-medium text-muted">
            Edit your details
          </summary>
          <div className="mt-4">
            <ProfileFields user={user} today={today} />
          </div>
        </details>
      </section>

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
