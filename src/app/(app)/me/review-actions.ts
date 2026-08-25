"use server";

import { sql, sqlOne } from "@/lib/db";
import {
  currentUser,
  dayLogsBetween,
  mealsBetween,
  measurementsFor,
  planWithRules,
  workoutsBetween,
} from "@/lib/data";
import { addDays, todayIn } from "@/lib/dates";
import { canInterpret } from "@/lib/interpret";
import { ageFrom, calorieTarget, energyEstimate } from "@/lib/profile";
import { kgToDisplay, cmToDisplay, lengthUnit, weightUnit } from "@/lib/units";
import {
  digestOf,
  reviewPlan,
  type PlanReview,
  type PlanSnapshot,
} from "@/lib/plan-review";

/** Everything the review reasons from, gathered server-side. */
async function snapshot(): Promise<{ userId: string; snap: PlanSnapshot } | null> {
  const user = await currentUser();
  if (!user?.active_plan_id) return null;

  const planned = await planWithRules(user.active_plan_id);
  if (!planned) return null;

  const today = todayIn(user.timezone);
  const from = addDays(today, -27);

  const [meals, workouts, measurements, logs] = await Promise.all([
    mealsBetween([user.id], from, today),
    workoutsBetween([user.id], from, today),
    measurementsFor([user.id]),
    dayLogsBetween([user.id], from, today),
  ]);

  const weightKg =
    [...measurements].reverse().find((m) => m.weight_kg != null)?.weight_kg ?? null;
  const age = ageFrom(user.birth_year, today);
  const energy = energyEstimate({
    weightKg,
    heightCm: user.height_cm,
    age,
    sex: user.sex,
    activity: user.activity_level,
  });

  const w = (kg: number | null) =>
    kg == null ? "unknown" : `${kgToDisplay(kg, user.units).toFixed(1)} ${weightUnit(user.units)}`;

  const aim =
    energy &&
    calorieTarget({
      energy,
      weightKg,
      goalWeightKg: user.goal_weight_kg,
      fmt: (kg) => w(kg),
    });

  // Per-day totals, so "averages 60g protein" is a real average of real days.
  const byDate = new Map<string, { kcal: number; protein: number }>();
  for (const meal of meals) {
    const row = byDate.get(meal.meal_date) ?? { kcal: 0, protein: 0 };
    row.kcal += meal.calories ?? 0;
    row.protein += meal.protein_g ?? 0;
    byDate.set(meal.meal_date, row);
  }
  const days = [...byDate.values()];
  const avg = (pick: (d: { kcal: number; protein: number }) => number) =>
    days.length ? Math.round(days.reduce((sum, d) => sum + pick(d), 0) / days.length) : null;

  const first = measurements.find((m) => m.weight_kg != null);
  const last = [...measurements].reverse().find((m) => m.weight_kg != null);
  const trend =
    first && last && first.measured_on !== last.measured_on
      ? `weight went from ${w(first.weight_kg)} on ${first.measured_on} to ${w(last.weight_kg)} on ${last.measured_on}`
      : "not enough weigh-ins to see a trend";

  const trainingDays = new Set(workouts.map((x) => x.workout_date)).size;

  return {
    userId: user.id,
    snap: {
      name: user.display_name,
      units: user.units,
      profile: [
        age ? `${age} years old` : "age not given",
        user.sex ?? "sex not given",
        user.height_cm
          ? `${cmToDisplay(user.height_cm, user.units).toFixed(0)} ${lengthUnit(user.units)}`
          : "height not given",
        `currently ${w(weightKg)}`,
        user.goal_weight_kg ? `goal ${w(user.goal_weight_kg)}` : "no goal weight set",
        user.activity_level ? `activity: ${user.activity_level}` : "activity not given",
      ].join(", "),
      about: user.about,
      energy: energy
        ? `burns about ${energy.bmr} kcal at rest (BMR), about ${energy.maintenance} to hold current weight.${
            aim ? ` Working target if unset: ${aim.target} (${aim.basis}).` : ""
          }${energy.approximate ? " Approximate — sex given as other." : ""}`
        : "not enough profile to estimate — needs height, age, sex and a weigh-in",
      rules: planned.rules
        .map(
          (rule) =>
            `  · ${rule.label} — ${rule.kind}${
              rule.target != null ? `, target ${rule.target}${rule.unit ?? ""}` : ""
            }, ${rule.cadence}, worth ${rule.points}`,
        )
        .join("\n"),
      logged: [
        `  ${logs.length} days logged in the last 28`,
        `  food logged on ${days.length} days`,
        avg((d) => d.kcal) != null ? `  averages ${avg((d) => d.kcal)} kcal a day` : null,
        avg((d) => d.protein) != null
          ? `  averages ${avg((d) => d.protein)} g protein a day${
              weightKg ? ` (${(avg((d) => d.protein)! / weightKg).toFixed(2)} g per kg)` : ""
            }`
          : null,
        `  trained on ${trainingDays} days: ${
          workouts.length
            ? [...new Set(workouts.map((x) => x.kind))].join(", ")
            : "nothing logged"
        }`,
        `  ${trend}`,
      ]
        .filter(Boolean)
        .join("\n"),
    },
  };
}

/** The last review, if one was written for exactly this picture. */
export async function cachedReview(): Promise<PlanReview | null> {
  const user = await currentUser();
  if (!user) return null;

  const snap = await snapshot();
  if (!snap) return null;

  const row = await sqlOne<{ body: PlanReview }>`
    select body from plan_reviews
    where user_id = ${user.id} and digest = ${digestOf(snap.snap)}
  `;
  return row?.body ?? null;
}

/**
 * Write one, unless the current one already matches. Triggered by a button
 * rather than on load: it costs a call, and it is a thing you ask for.
 */
export async function ensureReview(): Promise<PlanReview | null> {
  if (!canInterpret()) return null;

  const snap = await snapshot();
  if (!snap) return null;

  const digest = digestOf(snap.snap);
  const existing = await sqlOne<{ body: PlanReview }>`
    select body from plan_reviews where user_id = ${snap.userId} and digest = ${digest}
  `;
  if (existing) return existing.body;

  let review: PlanReview;
  try {
    review = await reviewPlan(snap.snap);
  } catch {
    return null;
  }

  await sql`
    insert into plan_reviews (user_id, digest, body)
    values (${snap.userId}, ${digest}, ${JSON.stringify(review)}::jsonb)
    on conflict (user_id)
      do update set digest = excluded.digest, body = excluded.body, created_at = now()
  `;

  return review;
}
