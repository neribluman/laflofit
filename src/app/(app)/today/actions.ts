"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sql, sqlOne } from "@/lib/db";
import { currentUser, measurementsFor, planWithRules } from "@/lib/data";
import {
  interpretDay,
  interpretPlate,
  macroTotals,
  type DayReport,
} from "@/lib/interpret";
import { describePerson } from "@/lib/profile";
import { statedToKg, statedToKm } from "@/lib/units";
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

/**
 * Exactly what one submission wrote, so it can be taken back out again. Rules
 * and the weigh-in carry their previous values rather than just their ids:
 * both are upserts, and undoing an overwrite means restoring what was there,
 * not deleting the row.
 */
export type LogReceipt = {
  date: string;
  dayLogId: string;
  mealIds: string[];
  workoutIds: string[];
  rules: {
    ruleId: string;
    existed: boolean;
    checked: boolean | null;
    value: number | null;
  }[];
  weight: { existed: boolean; previousKg: number | null } | null;
  noteSet: boolean;
};

export type LogResult =
  | { ok: true; report: DayReport; labels: Record<string, string>; receipt: LogReceipt }
  | { ok: false; error: string };

async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

/** Read the free text into a proposal. Writes nothing. */
async function readDay(date: string, text: string): Promise<ReadResult> {
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

/** Read a photo of a plate into a proposal. Writes nothing; the photo is not kept. */
async function readPlate(
  date: string,
  imageDataUrl: string,
): Promise<ReadResult> {
  const user = await requireUser();
  if (!user.active_plan_id) return { ok: false, error: "No plan to log against." };

  // A 1024px JPEG is a few hundred KB; past 6MB something else has arrived.
  if (imageDataUrl.length > 6_000_000) {
    return { ok: false, error: "That photo is too big. Try taking it again." };
  }

  const planned = await planWithRules(user.active_plan_id);
  if (!planned) return { ok: false, error: "No plan to log against." };

  const weighIns = await measurementsFor([user.id]);
  const latestWeight =
    [...weighIns].reverse().find((m) => m.weight_kg != null)?.weight_kg ?? null;

  try {
    const report = await interpretPlate({
      imageDataUrl,
      rules: planned.rules,
      units: user.units,
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
      error:
        message.includes("api_key") || message.includes("authentication")
          ? "The Claude API key isn't set up. See the README."
          : message,
    };
  }
}

/** Apply a proposal the user has confirmed. */
async function applyDay(
  date: string,
  report: DayReport,
): Promise<LogReceipt | null> {
  const user = await requireUser();
  if (!user.active_plan_id) return null;

  const planned = await planWithRules(user.active_plan_id);
  if (!planned) return null;
  // Never trust the ids that came back through the browser.
  const known = new Map(planned.rules.map((rule) => [rule.id, rule]));

  const log = await sqlOne<{ id: string }>`
    insert into day_logs (user_id, log_date, plan_id)
    values (${user.id}, ${date}::date, ${user.active_plan_id})
    on conflict (user_id, log_date) do update set updated_at = now()
    returning id
  `;
  if (!log) return null;

  const receipt: LogReceipt = {
    date,
    dayLogId: log.id,
    mealIds: [],
    workoutIds: [],
    rules: [],
    weight: null,
    noteSet: false,
  };

  for (const meal of report.meals.slice(0, 30)) {
    if (!meal.description?.trim()) continue;
    const saved = await sqlOne<{ id: string }>`
      insert into meals
        (user_id, meal_date, description, slot, calories, protein_g, carbs_g, fat_g, fibre_g, estimated)
      values (
        ${user.id}, ${date}::date, ${meal.description.trim().slice(0, 200)},
        ${meal.slot}, ${round(meal.calories)}, ${round(meal.protein_g)},
        ${round(meal.carbs_g)}, ${round(meal.fat_g)}, ${round(meal.fibre_g)},
        ${meal.estimated !== false}
      )
      returning id
    `;
    if (saved) receipt.mealIds.push(saved.id);
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

    const prior = await sqlOne<{ checked: boolean | null; value: number | null }>`
      select checked, value::float8 as value from rule_entries
      where day_log_id = ${log.id} and rule_id = ${rule.id}
    `;
    receipt.rules.push({
      ruleId: rule.id,
      existed: Boolean(prior),
      checked: prior?.checked ?? null,
      value: prior?.value ?? null,
    });

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
    receipt.workoutIds.push(session.id);

    for (const [i, exercise] of (workout.exercises ?? []).slice(0, 30).entries()) {
      if (!exercise.name?.trim()) continue;
      await sql`
        insert into exercises
          (workout_id, name, sets, reps, weight_kg, distance_km, minutes, notes, sort_order)
        values (
          ${session.id}, ${exercise.name.trim().slice(0, 80)},
          ${clamp(exercise.sets, 50)}, ${clamp(exercise.reps, 1000)},
          ${
            positive(exercise.weight) == null
              ? null
              : statedToKg(exercise.weight!, exercise.weight_unit ?? null, user.units)
          },
          ${
            positive(exercise.distance) == null
              ? null
              : statedToKm(exercise.distance!, exercise.distance_unit ?? null, user.units)
          },
          ${clamp(exercise.minutes, 600)},
          ${exercise.notes?.slice(0, 200) ?? null},
          ${i}
        )
      `;
    }
  }

  if (report.weight != null && Number.isFinite(report.weight) && report.weight > 0) {
    const priorWeight = await sqlOne<{ weight_kg: number | null }>`
      select weight_kg::float8 as weight_kg from measurements
      where user_id = ${user.id} and measured_on = ${date}::date
    `;
    receipt.weight = {
      existed: Boolean(priorWeight),
      previousKg: priorWeight?.weight_kg ?? null,
    };
    await sql`
      insert into measurements (user_id, measured_on, weight_kg)
      values (
        ${user.id}, ${date}::date,
        ${statedToKg(report.weight, report.weight_unit ?? null, user.units)}
      )
      on conflict (user_id, measured_on) do update set weight_kg = excluded.weight_kg
    `;
  }

  if (report.summary) {
    const noted = await sqlOne<{ id: string }>`
      update day_logs set note = coalesce(nullif(note, ''), ${report.summary.slice(0, 500)})
      where id = ${log.id} and user_id = ${user.id} and coalesce(note, '') = ''
      returning id
    `;
    receipt.noteSet = Boolean(noted);
  }

  revalidatePath("/today");
  revalidatePath("/me");
  revalidatePath("/crew");

  return receipt;
}

/**
 * Read the text and save it, in one press.
 *
 * There used to be a confirm step between those two, and it lost people's
 * work: the proposal looked like a result, so a real training session sat on
 * screen unsaved until the page was closed. Everything it writes shows up in
 * the day below, where each item already has its own Delete, and the whole
 * submission can be undone from the receipt.
 */
export async function logDay(date: string, text: string): Promise<LogResult> {
  const read = await readDay(date, text);
  if (!read.ok) return read;

  const nothing =
    read.report.meals.length === 0 &&
    read.report.rules.length === 0 &&
    read.report.workouts.length === 0 &&
    read.report.weight == null;
  if (nothing) {
    return {
      ok: false,
      error:
        "Nothing I could work with there. Try naming what you ate, what you trained, or what you weighed.",
    };
  }

  const receipt = await applyDay(date, read.report);
  if (!receipt) return { ok: false, error: "Couldn't save that. Try again." };

  return { ok: true, report: read.report, labels: read.labels, receipt };
}

/** Same, from a photo of a plate. */
export async function logPlate(
  date: string,
  imageDataUrl: string,
): Promise<LogResult> {
  const read = await readPlate(date, imageDataUrl);
  if (!read.ok) return read;
  if (read.report.meals.length === 0) {
    return { ok: false, error: "Couldn't make out any food there. Try another photo." };
  }

  const receipt = await applyDay(date, read.report);
  if (!receipt) return { ok: false, error: "Couldn't save that. Try again." };

  return { ok: true, report: read.report, labels: read.labels, receipt };
}

/** Put the day back exactly as it was before that submission. */
export async function undoLog(receipt: LogReceipt) {
  const user = await requireUser();

  if (receipt.mealIds.length > 0) {
    await sql`
      delete from meals
      where user_id = ${user.id} and id = any(${receipt.mealIds}::uuid[])
    `;
  }

  // Exercises cascade with their workout.
  if (receipt.workoutIds.length > 0) {
    await sql`
      delete from workouts
      where user_id = ${user.id} and id = any(${receipt.workoutIds}::uuid[])
    `;
  }

  // Rules were upserts: a row that existed before goes back to its old value,
  // a row this submission created is removed.
  // The receipt comes back through the browser, so the day it names has to be
  // checked against the session before anything is written through it.
  const ownsDay = await sqlOne<{ id: string }>`
    select id from day_logs where id = ${receipt.dayLogId} and user_id = ${user.id}
  `;

  for (const rule of ownsDay ? receipt.rules : []) {
    if (rule.existed) {
      await sql`
        update rule_entries set checked = ${rule.checked}, value = ${rule.value}
        where day_log_id = ${receipt.dayLogId} and rule_id = ${rule.ruleId}
      `;
    } else {
      await sql`
        delete from rule_entries
        where day_log_id = ${receipt.dayLogId} and rule_id = ${rule.ruleId}
      `;
    }
  }

  if (receipt.weight) {
    if (receipt.weight.existed) {
      await sql`
        update measurements set weight_kg = ${receipt.weight.previousKg}
        where user_id = ${user.id} and measured_on = ${receipt.date}::date
      `;
    } else {
      await sql`
        delete from measurements
        where user_id = ${user.id} and measured_on = ${receipt.date}::date
      `;
    }
  }

  if (receipt.noteSet && ownsDay) {
    await sql`
      update day_logs set note = null
      where id = ${receipt.dayLogId} and user_id = ${user.id}
    `;
  }

  revalidatePath("/today");
  revalidatePath("/me");
  revalidatePath("/crew");
}
