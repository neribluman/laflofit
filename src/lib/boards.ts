import type { Exercise, Meal, PlanRule, User } from "./types";
import { energyEstimate, ageFrom } from "./profile";

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

export type BoardKey = "overall" | "protein" | "calories" | "strength";

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
    return { ...NOTHING, detail: "set a calorie rule, or add age and height" };
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
  if (best.size === 0) return { ...NOTHING, detail: "no barbell lifts logged" };

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
