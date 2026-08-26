import type { Exercise, Meal, PlanRule, User, Workout } from "./types";
import { energyEstimate, ageFrom, missingForEnergy, calorieTarget } from "./profile";
import { kgToDisplay, weightUnit } from "./units";

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
  | "plan"
  | "training"
  | "protein"
  | "calories"
  | "strength";

/** The boards that are actually contests. "overall" is their combination. */
export const CATEGORIES = ["plan", "training", "protein", "calories", "strength"] as const;

export type CategoryKey = (typeof CATEGORIES)[number];

export const CATEGORY_LABEL: Record<CategoryKey, string> = {
  plan: "Plan",
  training: "Training",
  protein: "Protein",
  calories: "Calories",
  strength: "Strength",
};

export type BoardEntry = {
  /** What ranks them. Higher is always better, whatever the board. */
  value: number;
  /** The number as people say it. */
  display: string;
  detail: string;
  /** True when they simply have not logged enough for this board to mean anything. */
  missing: boolean;
  /** Where the number came from, in plain English. Shown on tap. */
  explain?: string;
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

  const fmt = (kg: number) =>
    `${kgToDisplay(kg, user.units).toFixed(1)} ${weightUnit(user.units)}`;

  const aim = estimate
    ? calorieTarget({
        energy: estimate,
        weightKg,
        goalWeightKg: user.goal_weight_kg,
        fmt,
      })
    : null;

  // A number they set themselves beats one we worked out for them.
  const target = explicit ?? aim?.target ?? null;
  const explain = explicit
    ? `${explicit.toLocaleString()} kcal is the target set in your own plan, so that is what this scores against. Change it on the Plan tab.`
    : aim?.explain;

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
    detail: `${Math.round(perDay).toLocaleString()} of ${Math.round(target).toLocaleString()} kcal a day${
      aim && !explicit && aim.basis === "loss" ? " to goal" : ""
    }`,
    missing: false,
    explain: `${explain} 100 is dead on it — over and under cost the same.`,
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

/**
 * The overall standing: not one score, but how you placed across all of them.
 *
 * A single "percentage of plan" was never comparable between people. A plan
 * with six strict rules and a plan with a calorie target are different exams,
 * and marking them out of 100 each and comparing the marks is meaningless.
 * Following your own plan is one contest among several here, and the winner
 * overall is whoever did well across the most of them.
 *
 * Placement points rather than raw values, because grams per kilo and calorie
 * accuracy do not add up to anything.
 *
 * A point for entering, and a point for everyone you finish ahead of. That
 * scales itself: winning a contest two people entered is worth 2, while third
 * of five is worth 3 — which is right, because beating four people is a
 * bigger thing than beating one. A fixed 5-3-2 medal table handed the same
 * silver to second-of-two as to second-of-five.
 *
 * It also means breadth beats a single speciality, which is what "overall"
 * ought to mean.
 */
const ENTERING = 1;

export type CategoryResult = {
  key: CategoryKey;
  label: string;
  /** null when they weren't in this contest at all. */
  place: number | null;
  points: number;
  /** How many people were in it. */
  field: number;
  display: string;
};

export function combineBoards(
  perMember: Record<CategoryKey, BoardEntry>[],
): { entry: BoardEntry; results: CategoryResult[] }[] {
  const results: CategoryResult[][] = perMember.map(() => []);

  for (const key of CATEGORIES) {
    // A zero is not a placing. Logging nothing and eating nothing are both
    // "didn't enter", and neither should collect a participation point.
    const inIt = perMember
      .map((boards, i) => ({ i, entry: boards[key] }))
      .filter(({ entry }) => !entry.missing && entry.value > 0);

    const ladder = [...inIt].sort((a, b) => b.entry.value - a.entry.value);

    for (const [i, boards] of perMember.entries()) {
      const mine = inIt.find((c) => c.i === i);
      if (!mine) {
        results[i].push({
          key,
          label: CATEGORY_LABEL[key],
          place: null,
          points: 0,
          field: inIt.length,
          display: boards[key].display,
        });
        continue;
      }
      // Equal values take the same place, so a tie splits nobody — and a tie
      // beats nobody either, which is what makes the two consistent.
      const place =
        ladder.findIndex((other) => other.entry.value === mine.entry.value) + 1;
      const beaten = inIt.filter((o) => o.entry.value < mine.entry.value).length;
      results[i].push({
        key,
        label: CATEGORY_LABEL[key],
        place,
        points: ENTERING + beaten,
        field: inIt.length,
        display: boards[key].display,
      });
    }
  }

  return results.map((mine) => {
    const total = mine.reduce((sum, r) => sum + r.points, 0);
    const ranked = [...mine].sort((a, b) => b.points - a.points);
    const scored = ranked.filter((r) => r.points > 0);

    return {
      results: mine,
      entry: {
        value: total,
        display: `${total}`,
        detail:
          scored.length === 0
            ? "not in any contest yet"
            : scored
                .map((r) =>
                  // A medal needs a field to have won it in. Second of two is
                  // last of two, and a silver next to it says otherwise.
                  r.field >= 3
                    ? `${placeMark(r.place)} ${r.label}`
                    : `${r.label} ${ordinal(r.place ?? 0)} of ${r.field}`,
                )
                .join(" · "),
        missing: false,
        explain: [
          "Overall is five separate contests added together. In each one you score a point for entering and a point for everyone you finish ahead of — so winning a contest five people entered is worth more than winning one that two did.",
          "Following your own plan is one of those contests rather than the whole score, because a six-rule plan and a calorie target are different exams and comparing their percentages proved nothing.",
          mine
            .map((r) =>
              r.place == null
                ? `${r.label} — didn't enter, 0`
                : `${r.label} — ${ordinal(r.place)} of ${r.field} (${r.display}), ${r.points} point${r.points === 1 ? "" : "s"}`,
            )
            .join(" · "),
          `Total ${total}.`,
        ].join("\n\n"),
      },
    };
  });
}

function placeMark(place: number | null): string {
  if (place === 1) return "🥇";
  if (place === 2) return "🥈";
  if (place === 3) return "🥉";
  return ordinal(place ?? 0);
}

function ordinal(n: number): string {
  const rest = n % 100;
  if (rest >= 11 && rest <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}
