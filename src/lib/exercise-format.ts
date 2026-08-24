/** Numbers already converted to the reader's units. */
export type ExerciseShape = {
  sets: number | null;
  reps: number | null;
  weight: number | null;
  distance: number | null;
  minutes: number | null;
};

const trim = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** "5 × 5 @ 100 kg", "5 km · 25 min", "3 sets". */
export function describeExercise(
  exercise: ExerciseShape,
  weightUnit: string,
  distanceUnit: string,
): string {
  const parts: string[] = [];

  if (exercise.sets != null && exercise.reps != null) {
    parts.push(`${exercise.sets} × ${exercise.reps}`);
  } else if (exercise.sets != null) {
    parts.push(`${exercise.sets} set${exercise.sets === 1 ? "" : "s"}`);
  } else if (exercise.reps != null) {
    parts.push(`${exercise.reps} reps`);
  }

  if (exercise.weight != null) {
    const load = `${trim(exercise.weight)} ${weightUnit}`;
    if (parts.length > 0) parts[parts.length - 1] += ` @ ${load}`;
    else parts.push(load);
  }

  if (exercise.distance != null) {
    parts.push(`${trim(exercise.distance)} ${distanceUnit}`);
  }
  if (exercise.minutes != null) parts.push(`${exercise.minutes} min`);

  return parts.join(" · ");
}
