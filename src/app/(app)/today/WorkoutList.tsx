import { deleteWorkout } from "../actions";
import { describeExercise } from "@/lib/exercise-format";
import { kgToDisplay, kmToDisplay } from "@/lib/units";
import type { Exercise, Units, Workout } from "@/lib/types";

export default function WorkoutList({
  workouts,
  exercises,
  units,
  weightUnit,
  distanceUnit,
}: {
  workouts: Workout[];
  exercises: Exercise[];
  units: Units;
  weightUnit: string;
  distanceUnit: string;
}) {
  if (workouts.length === 0) return null;

  const byWorkout = new Map<string, Exercise[]>();
  for (const exercise of exercises) {
    byWorkout.set(exercise.workout_id, [
      ...(byWorkout.get(exercise.workout_id) ?? []),
      exercise,
    ]);
  }

  return (
    <ul className="space-y-2">
        {workouts.map((workout) => {
          const moves = byWorkout.get(workout.id) ?? [];
          return (
            <li key={workout.id} className="card p-3.5">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {workout.kind}
                    {workout.minutes ? (
                      <span className="nums text-muted"> · {workout.minutes} min</span>
                    ) : null}
                    <span className="text-muted"> · {workout.intensity}</span>
                  </p>
                  {workout.notes && (
                    <p className="text-xs text-muted">{workout.notes}</p>
                  )}
                </div>
                <form action={deleteWorkout.bind(null, workout.id)}>
                  <button
                    className="btn-quiet px-1 py-1 text-xs"
                    aria-label={`Delete ${workout.kind}`}
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
                                : kgToDisplay(move.weight_kg, units),
                            distance:
                              move.distance_km == null
                                ? null
                                : kmToDisplay(move.distance_km, units),
                            minutes: move.minutes,
                          },
                          weightUnit,
                          distanceUnit,
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
  );
}
