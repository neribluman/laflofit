import Link from "next/link";
import { redirect } from "next/navigation";
import {
  currentUser,
  exercisesForWorkouts,
  measurementsFor,
  workoutsBetween,
} from "@/lib/data";
import { addDays, prettyDate, todayIn } from "@/lib/dates";
import {
  cmToDisplay,
  distanceUnit,
  fmtWeight,
  kgToDisplay,
  kmToDisplay,
  lengthUnit,
  weightUnit,
} from "@/lib/units";
import { describeExercise } from "@/lib/exercise-format";
import { WORKOUT_KINDS } from "@/lib/presets";
import {
  addWorkout,
  deleteMeasurement,
  deleteWorkout,
  saveMeasurement,
} from "../actions";
import SubmitButton from "@/components/SubmitButton";

export default async function LogPage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  const today = todayIn(user.timezone);
  const [workouts, measurements] = await Promise.all([
    workoutsBetween([user.id], addDays(today, -20), today),
    measurementsFor([user.id]),
  ]);
  const exercises = await exercisesForWorkouts(workouts.map((w) => w.id));
  const byWorkout = new Map<string, typeof exercises>();
  for (const exercise of exercises) {
    byWorkout.set(exercise.workout_id, [
      ...(byWorkout.get(exercise.workout_id) ?? []),
      exercise,
    ]);
  }

  const recentWeights = measurements.slice(-8).reverse();
  const weight = weightUnit(user.units);
  const distance = distanceUnit(user.units);

  return (
    <main className="mx-auto max-w-lg space-y-8 lg:max-w-2xl">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">History</h1>
        <p className="mt-1 text-sm text-muted">
          Everything you&apos;ve logged, and the forms for adding something by
          hand. Day-to-day, just talk to the box on{" "}
          <Link href="/today" className="font-medium text-accent">
            Today
          </Link>
          .
        </p>
      </header>

      <section>
        <h2 className="label">Last 3 weeks of training</h2>
        {workouts.length === 0 ? (
          <p className="card p-4 text-sm text-muted">
            Nothing logged yet. The first one is the hard one.
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

      <section>
        <h2 className="label">Add a weigh-in</h2>
        <form action={saveMeasurement} className="card space-y-4 p-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="weight">
                Weight ({weight})
              </label>
              <input
                id="weight"
                name="weight"
                type="number"
                inputMode="decimal"
                step="0.1"
                placeholder="—"
                className="field nums"
              />
            </div>
            <div>
              <label className="label" htmlFor="measured_on">
                Date
              </label>
              <input
                id="measured_on"
                name="measured_on"
                type="date"
                defaultValue={today}
                max={today}
                required
                className="field nums"
              />
            </div>
            <div>
              <label className="label" htmlFor="waist">
                Waist ({lengthUnit(user.units)})
              </label>
              <input
                id="waist"
                name="waist"
                type="number"
                inputMode="decimal"
                step="0.1"
                placeholder="optional"
                className="field nums"
              />
            </div>
            <div>
              <label className="label" htmlFor="body_fat">
                Body fat (%)
              </label>
              <input
                id="body_fat"
                name="body_fat"
                type="number"
                inputMode="decimal"
                step="0.1"
                placeholder="optional"
                className="field nums"
              />
            </div>
          </div>
          <SubmitButton pendingLabel="Saving…">Save weigh-in</SubmitButton>
          <p className="text-xs text-muted">
            One entry per day — saving again replaces that day&apos;s numbers.
          </p>
        </form>
      </section>

      {recentWeights.length > 0 && (
        <section>
          <h2 className="label">Recent weigh-ins</h2>
          <ul className="card divide-y divide-line">
            {recentWeights.map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <span className="flex-1 text-muted">
                  {prettyDate(m.measured_on, today)}
                </span>
                <span className="nums font-semibold">
                  {fmtWeight(m.weight_kg, user.units)}
                </span>
                {m.waist_cm != null && (
                  <span className="nums text-xs text-muted">
                    {cmToDisplay(m.waist_cm, user.units).toFixed(1)}{" "}
                    {lengthUnit(user.units)}
                  </span>
                )}
                <form action={deleteMeasurement.bind(null, m.id)}>
                  <button
                    className="btn-quiet px-1 py-1 text-xs"
                    aria-label={`Delete weigh-in from ${m.measured_on}`}
                  >
                    Delete
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <details className="card p-4">
        <summary className="cursor-pointer text-sm font-medium text-muted">
          Add a workout by hand
        </summary>
        <form action={addWorkout} className="mt-4 space-y-4">
          <div className="grid grid-cols-4 gap-1.5">
            {WORKOUT_KINDS.map((kind, i) => (
              <label
                key={kind}
                className="cursor-pointer rounded-lg border border-line bg-surface-2 py-2 text-center text-xs font-medium
                           has-checked:border-accent has-checked:bg-accent/15"
              >
                <input
                  type="radio"
                  name="kind"
                  value={kind}
                  defaultChecked={i === 0}
                  className="sr-only"
                />
                {kind}
              </label>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="minutes">
                Minutes
              </label>
              <input
                id="minutes"
                name="minutes"
                type="number"
                inputMode="numeric"
                min={0}
                max={600}
                placeholder="45"
                className="field nums"
              />
            </div>
            <div>
              <label className="label" htmlFor="workout_date">
                Date
              </label>
              <input
                id="workout_date"
                name="workout_date"
                type="date"
                defaultValue={today}
                max={today}
                required
                className="field nums"
              />
            </div>
          </div>

          <div>
            <p className="label">How hard?</p>
            <div className="grid grid-cols-3 gap-1.5">
              {["easy", "moderate", "hard"].map((level) => (
                <label
                  key={level}
                  className="cursor-pointer rounded-lg border border-line bg-surface-2 py-2 text-center text-xs font-medium capitalize
                             has-checked:border-accent has-checked:bg-accent/15"
                >
                  <input
                    type="radio"
                    name="intensity"
                    value={level}
                    defaultChecked={level === "moderate"}
                    className="sr-only"
                  />
                  {level}
                </label>
              ))}
            </div>
          </div>

          <input
            name="notes"
            maxLength={300}
            placeholder="Notes (optional)"
            className="field"
          />
          <SubmitButton pendingLabel="Adding…">Add workout</SubmitButton>
        </form>
      </details>
    </main>
  );
}
