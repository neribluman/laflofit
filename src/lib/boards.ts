import type { Exercise, Meal, PlanRule, User, Workout } from "./types";
import { energyEstimate, ageFrom, missingForEnergy } from "./profile";

/**
 * The big barbell lifts, matched loosely because the names come out of free
 * text — "back squat", "Squats", "barbell squat" are all the same lift.
 */
const LIFTS: { key: string; label: string; test: RegExp }[] = [
  { key: "squat", label: "Squat", test: /squat/i },
  { key: "bench", label: "Bench", test: /bench/i },
  { key: "deadlift", label: "Deadlift", test: /dead\s*lift|deadlift/i },
  { key: "press", label: "Overhead press", test: /overhead|shoulder press|military|ohp/i },
];

export const liftFor = (name: string) =>
  LIFTS.find((lift) => lift.test.test(name)) ?? null;

/**
 * Epley: what a single rep would likely be, from a set of several. Without it
 * a heavy single beats a hard set of five on the board, which is not the same
 * thing as being stronger.
 */
export const estimatedOneRep = (weightKg: number, reps: number | null) =>
  weightKg * (1 + Math.max(1, reps ?? 1) / 30);

export type BoardKey =
  | "overall"
  | "training"
  | "protein"
  | "calories"
  | "strength";

export type BoardEntry = {
  /** What ranks them. Higher is always better, whatever the board. */
  value: number;
  /** The number as people say it. */
  display: string;
  detail: string;
  /** True when they simply have not logged enough for this board to mean anything. */
  missing: boolean;
};

const NOTHING: BoardEntry = {
  value: -1,
  display: "—",
  detail: "nothing to go on yet",
  missing: true,
};

/** Average grams of protein per kilo of bodyweight, over the days they ate. */
export function proteinBoard(meals: Meal[], weightKg: number | null): BoardEntry {
  if (!weightKg) return { ...NOTHING, detail: "needs a weigh-in" };

  const byDate = new Map<string, number>();
  for (const meal of meals) {
    if (meal.protein_g == null) continue;
    byDate.set(meal.meal_date, (byDate.get(meal.meal_date) ?? 0) + meal.protein_g);
  }
  if (byDate.size === 0) return { ...NOTHING, detail: "no food logged" };

  const totals = [...byDate.values()];
  const perDay = totals.reduce((a, b) => a + b, 0) / totals.length;
  const perKg = perDay / weightKg;

  return {
    value: perKg,
    display: `${perKg.toFixed(2)} g/kg`,
    detail: `${Math.round(perDay)} g a day over ${totals.length} day${totals.length === 1 ? "" : "s"}`,
    missing: false,
  };
}

/**
 * How close they stayed to their own calorie target — not how little they ate.
 * Ranking by "lowest" would make under-eating the winning move, which is not a
 * thing to put in front of a group of friends. Over and under cost the same.
 */
export function calorieBoard(
  meals: Meal[],
  user: User,
  rules: PlanRule[],
  weightKg: number | null,
  today: string,
): BoardEntry {
  const explicit = rules.find(
    (rule) =>
      rule.kind === "count" &&
      rule.target != null &&
      (["kcal", "cal", "calories"].includes((rule.unit ?? "").toLowerCase()) ||
        rule.label.toLowerCase().includes("calorie")),
  )?.target;

  const estimate = energyEstimate({
    weightKg,
    heightCm: user.height_cm,
    age: ageFrom(user.birth_year, today),
    sex: user.sex,
    activity: user.activity_level,
  });

  const target = explicit ?? estimate?.maintenance ?? null;
  if (!target) {
    const missing = missingForEnergy(user, weightKg, today);
    return {
      ...NOTHING,
      detail: missing.length
        ? `needs ${missing.join(" and ")}`
        : "needs a calorie target",
    };
  }

  const byDate = new Map<string, number>();
  for (const meal of meals) {
    if (meal.calories == null) continue;
    byDate.set(meal.meal_date, (byDate.get(meal.meal_date) ?? 0) + meal.calories);
  }
  if (byDate.size === 0) return { ...NOTHING, detail: "no food logged" };

  const totals = [...byDate.values()];
  const perDay = totals.reduce((a, b) => a + b, 0) / totals.length;
  const drift = Math.abs(perDay - target) / target;
  const score = Math.max(0, Math.round((1 - drift) * 100));

  return {
    value: score,
    display: `${score}`,
    detail: `${Math.round(perDay).toLocaleString()} of ${Math.round(target).toLocaleString()} kcal a day`,
    missing: false,
  };
}

/**
 * Relative strength: estimated one-rep max on the big lifts, added up and
 * divided by bodyweight. Normalising by weight is the whole point — otherwise
 * it is a board about who is heaviest.
 */
export function strengthBoard(
  exercises: Exercise[],
  weightKg: number | null,
): BoardEntry {
  if (!weightKg) return { ...NOTHING, detail: "needs a weigh-in" };

  const best = new Map<string, number>();
  for (const exercise of exercises) {
    if (exercise.weight_kg == null || exercise.weight_kg <= 0) continue;
    const lift = liftFor(exercise.name);
    if (!lift) continue;
    const oneRep = estimatedOneRep(exercise.weight_kg, exercise.reps);
    if (oneRep > (best.get(lift.key) ?? 0)) best.set(lift.key, oneRep);
  }
  if (best.size === 0) {
    return { ...NOTHING, detail: "no squat, bench, deadlift or press logged" };
  }

  const total = [...best.values()].reduce((a, b) => a + b, 0);
  const ratio = total / weightKg;

  const detail = LIFTS.filter((lift) => best.has(lift.key))
    .map((lift) => `${lift.label} ${(best.get(lift.key)! / weightKg).toFixed(2)}×`)
    .join(" · ");

  return {
    value: ratio,
    display: `${ratio.toFixed(2)}×`,
    detail,
    missing: false,
  };
}

/**
 * Days trained this week. Deliberately not minutes: free text gives a duration
 * for a yoga class and almost never for a lifting session, so a time-based
 * board quietly ranks the lifters last. Showing up is the thing every sport in
 * this crew has in common, so that is what it counts.
 *
 * Nobody is ever "missing" here — a zero is the honest answer and the whole
 * point of a board your friends can see.
 */
export function trainingBoard(workouts: Workout[], week: string[]): BoardEntry {
  const days = new Set<string>();
  const kinds = new Map<string, number>();
  let minutes = 0;

  for (const workout of workouts) {
    if (!week.includes(workout.workout_date)) continue;
    days.add(workout.workout_date);
    kinds.set(workout.kind, (kinds.get(workout.kind) ?? 0) + 1);
    minutes += workout.minutes ?? 0;
  }

  const sessions = [...kinds.values()].reduce((a, b) => a + b, 0);
  if (sessions === 0) {
    return { value: 0, display: "—", detail: "no training logged", missing: false };
  }

  // Same number of days is a real tie; two sessions on one of them is not
  // quite. Small enough never to overtake a whole extra day.
  const value = days.size + Math.min(sessions, 20) * 0.001;

  return {
    value,
    display: `${days.size} day${days.size === 1 ? "" : "s"}`,
    detail:
      [...kinds]
        .map(([kind, n]) => (n > 1 ? `${kind} ×${n}` : kind))
        .join(" · ") + (minutes > 0 ? ` · ${minutes} min` : ""),
    missing: false,
  };
}
