"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sql, sqlOne } from "@/lib/db";
import { currentUser, measurementsFor, planWithRules } from "@/lib/data";
import { interpretDay, macroTotals, type DayReport } from "@/lib/interpret";
import { describePerson } from "@/lib/profile";
import { displayToKg, displayToKm } from "@/lib/units";
import { WORKOUT_KINDS } from "@/lib/presets";
import type { PlanRule, User } from "@/lib/types";

const clamp = (value: number | null | undefined, max: number) =>
  value == null || !Number.isFinite(value)
    ? null
    : Math.max(0, Math.min(max, Math.round(value)));

const positive = (value: number | null | undefined) =>
  value == null || !Number.isFinite(value) || value < 0 ? null : value;

const round = (value: number | null | undefined) =>
  value == null || !Number.isFinite(value) ? null : Math.round(value);

/** Which macro, if any, a "count" rule is really asking for. */
function macroForRule(rule: PlanRule): keyof ReturnType<typeof macroTotals> | null {
  const label = rule.label.toLowerCase();
  const unit = (rule.unit ?? "").toLowerCase();
  if (["kcal", "cal", "calories"].includes(unit) || label.includes("calorie")) {
    return "calories";
  }
  if (label.includes("protein")) return "protein";
  if (label.includes("carb")) return "carbs";
  if (label.includes("fibre") || label.includes("fiber")) return "fibre";
  if (label.includes("fat")) return "fat";
  return null;
}

export type ReadResult =
  | { ok: true; report: DayReport; labels: Record<string, string> }
  | { ok: false; error: string };

async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

/** Read the free text into a proposal. Writes nothing — the user confirms first. */
export async function readDay(date: string, text: string): Promise<ReadResult> {
  const user = await requireUser();
  const trimmed = text.trim();
  if (trimmed.length < 3) return { ok: false, error: "Tell me a bit more." };
  if (!user.active_plan_id) return { ok: false, error: "No plan to log against." };

  const planned = await planWithRules(user.active_plan_id);
  if (!planned) return { ok: false, error: "No plan to log against." };

  const logged = await sql<{ label: string }>`
    select pr.label from rule_entries re
    join plan_rules pr on pr.id = re.rule_id
    join day_logs d on d.id = re.day_log_id
    where d.user_id = ${user.id} and d.log_date = ${date}::date and re.checked = true
  `;

  const weighIns = await measurementsFor([user.id]);
  const latestWeight =
    [...weighIns].reverse().find((m) => m.weight_kg != null)?.weight_kg ?? null;

  try {
    const report = await interpretDay({
      text: trimmed.slice(0, 2000),
      rules: planned.rules,
      units: user.units,
      alreadyLogged: logged.map((row) => row.label),
      person: describePerson(user, latestWeight, date),
    });
    return {
      ok: true,
      report,
      labels: Object.fromEntries(planned.rules.map((r) => [r.id, r.label])),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Something went wrong.";
    return {
      ok: false,
      error: message.includes("api_key") || message.includes("authentication")
        ? "The Claude API key isn't set up. See the README."
        : message,
    };
  }
}

/** Apply a proposal the user has confirmed. */
export async function applyDay(date: string, report: DayReport) {
  const user = await requireUser();
  if (!user.active_plan_id) return;

  const planned = await planWithRules(user.active_plan_id);
  if (!planned) return;
  // Never trust the ids that came back through the browser.
  const known = new Map(planned.rules.map((rule) => [rule.id, rule]));

  const log = await sqlOne<{ id: string }>`
    insert into day_logs (user_id, log_date, plan_id)
    values (${user.id}, ${date}::date, ${user.active_plan_id})
    on conflict (user_id, log_date) do update set updated_at = now()
    returning id
  `;
  if (!log) return;

  for (const meal of report.meals.slice(0, 30)) {
    if (!meal.description?.trim()) continue;
    await sql`
      insert into meals
        (user_id, meal_date, description, slot, calories, protein_g, carbs_g, fat_g, fibre_g, estimated)
      values (
        ${user.id}, ${date}::date, ${meal.description.trim().slice(0, 200)},
        ${meal.slot}, ${round(meal.calories)}, ${round(meal.protein_g)},
        ${round(meal.carbs_g)}, ${round(meal.fat_g)}, ${round(meal.fibre_g)},
        ${meal.estimated !== false}
      )
    `;
  }

  // A plan with a calorie or protein rule should get it filled from the food
  // that was just logged, rather than asking for the same number twice.
  const totals = macroTotals(report.meals);
  const stated = new Set(report.rules.map((entry) => entry.rule_id));
  const autoFilled = planned.rules.flatMap((rule) => {
    if (rule.kind !== "count" || stated.has(rule.id)) return [];
    const macro = macroForRule(rule);
    if (!macro || totals[macro] <= 0) return [];
    return [{ rule_id: rule.id, met: null, value: totals[macro], evidence: "" }];
  });

  for (const entry of [...report.rules, ...autoFilled]) {
    const rule = known.get(entry.rule_id);
    if (!rule) continue;

    if (rule.kind === "count") {
      if (entry.value == null || !Number.isFinite(entry.value)) continue;
      await sql`
        insert into rule_entries (day_log_id, rule_id, value)
        values (${log.id}, ${rule.id}, ${entry.value})
        on conflict (day_log_id, rule_id) do update set value = excluded.value
      `;
    } else {
      if (typeof entry.met !== "boolean") continue;
      await sql`
        insert into rule_entries (day_log_id, rule_id, checked)
        values (${log.id}, ${rule.id}, ${entry.met})
        on conflict (day_log_id, rule_id) do update set checked = excluded.checked
      `;
    }
  }

  for (const workout of report.workouts.slice(0, 5)) {
    if (!WORKOUT_KINDS.includes(workout.kind)) continue;

    const session = await sqlOne<{ id: string }>`
      insert into workouts (user_id, workout_date, kind, minutes, intensity, notes)
      values (
        ${user.id}, ${date}::date, ${workout.kind}, ${clamp(workout.minutes, 600)},
        ${["easy", "moderate", "hard"].includes(workout.intensity) ? workout.intensity : "moderate"},
        ${workout.notes?.slice(0, 300) ?? null}
      )
      returning id
    `;
    if (!session) continue;

    for (const [i, exercise] of (workout.exercises ?? []).slice(0, 30).entries()) {
      if (!exercise.name?.trim()) continue;
      await sql`
        insert into exercises
          (workout_id, name, sets, reps, weight_kg, distance_km, minutes, notes, sort_order)
        values (
          ${session.id}, ${exercise.name.trim().slice(0, 80)},
          ${clamp(exercise.sets, 50)}, ${clamp(exercise.reps, 1000)},
          ${positive(exercise.weight) == null ? null : displayToKg(exercise.weight!, user.units)},
          ${positive(exercise.distance) == null ? null : displayToKm(exercise.distance!, user.units)},
          ${clamp(exercise.minutes, 600)},
          ${exercise.notes?.slice(0, 200) ?? null},
          ${i}
        )
      `;
    }
  }

  if (report.weight != null && Number.isFinite(report.weight) && report.weight > 0) {
    await sql`
      insert into measurements (user_id, measured_on, weight_kg)
      values (${user.id}, ${date}::date, ${displayToKg(report.weight, user.units)})
      on conflict (user_id, measured_on) do update set weight_kg = excluded.weight_kg
    `;
  }

  if (report.summary) {
    await sql`
      update day_logs set note = coalesce(nullif(note, ''), ${report.summary.slice(0, 500)})
      where id = ${log.id} and user_id = ${user.id}
    `;
  }

  revalidatePath("/today");
  revalidatePath("/me");
  revalidatePath("/crew");
  revalidatePath("/me");
}
