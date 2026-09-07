import "server-only";

import { revalidatePath } from "next/cache";
import { sql, sqlOne } from "@/lib/db";
import { measurementsFor, planWithRules } from "@/lib/data";
import { interpretDay, interpretPlate, macroTotals, type DayReport } from "@/lib/interpret";
import { describePerson } from "@/lib/profile";
import { statedToKg, statedToKm } from "@/lib/units";
import { WORKOUT_KINDS } from "@/lib/presets";
import type { PlanRule, User } from "@/lib/types";

/**
 * Reading and writing a day, given the person it belongs to.
 *
 * Lifted out of the page's server actions because a WhatsApp message has no
 * browser session: the webhook resolves a phone number to a user and then
 * needs exactly the same logic the log box uses. One implementation, so the
 * two routes into the app can never drift apart.
 */

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
  | {
      ok: true;
      report: DayReport;
      labels: Record<string, string>;
      /** The plan this was read against, so saving needn't fetch it again. */
      rules: PlanRule[];
    }
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

/** Read the free text into a proposal. Writes nothing. */
export async function readDayFor(user: User, date: string, text: string): Promise<ReadResult> {
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
      rules: planned.rules,
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
export async function readPlateFor(
  user: User,
  date: string,
  imageDataUrl: string,
): Promise<ReadResult> {
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
      rules: planned.rules,
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
export async function applyReportFor(
  user: User,
  date: string,
  report: DayReport,
  /** Passed in when the caller already has it: reading the plan a second time
   *  is two more round trips for something that cannot have changed since. */
  loaded?: { rules: PlanRule[] } | null,
): Promise<LogReceipt | null> {
  if (!user.active_plan_id) return null;

  const planned = loaded ?? (await planWithRules(user.active_plan_id));
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

  // One statement for the lot. Each of these was its own round trip, so a
  // six-item dinner cost six of them — the difference between a save that
  // feels instant and one you sit through.
  const items = report.meals.slice(0, 30).filter((m) => m.description?.trim());
  if (items.length > 0) {
    const saved = await sql<{ id: string }>`
      insert into meals
        (user_id, meal_date, description, slot, calories, protein_g, carbs_g, fat_g, fibre_g, estimated)
      select ${user.id}::uuid, ${date}::date, d, s, c, p, cb, f, fi, e
      from unnest(
        ${items.map((m) => m.description.trim().slice(0, 200))}::text[],
        ${items.map((m) => m.slot)}::text[],
        ${items.map((m) => round(m.calories))}::int[],
        ${items.map((m) => round(m.protein_g))}::int[],
        ${items.map((m) => round(m.carbs_g))}::int[],
        ${items.map((m) => round(m.fat_g))}::int[],
        ${items.map((m) => round(m.fibre_g))}::int[],
        ${items.map((m) => m.estimated !== false)}::bool[]
      ) as t(d, s, c, p, cb, f, fi, e)
      returning id
    `;
    receipt.mealIds.push(...saved.map((row) => row.id));
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

  // Reading each tick's old value before overwriting it — which is what makes
  // Undo able to restore rather than just delete — used to cost a round trip
  // per rule. All of them at once costs one, and so does writing them back.
  const entries = [...report.rules, ...autoFilled].filter((e) => known.has(e.rule_id));
  const priors = new Map<string, { checked: boolean | null; value: number | null }>();
  if (entries.length > 0) {
    const rows = await sql<{ rule_id: string; checked: boolean | null; value: number | null }>`
      select rule_id, checked, value::float8 as value from rule_entries
      where day_log_id = ${log.id} and rule_id = any(${entries.map((e) => e.rule_id)}::uuid[])
    `;
    for (const row of rows) priors.set(row.rule_id, row);
  }

  const ticks: { ruleId: string; checked: boolean | null; value: number | null }[] = [];
  for (const entry of entries) {
    const rule = known.get(entry.rule_id)!;
    const prior = priors.get(rule.id);
    receipt.rules.push({
      ruleId: rule.id,
      existed: Boolean(prior),
      checked: prior?.checked ?? null,
      value: prior?.value ?? null,
    });

    if (rule.kind === "count") {
      if (entry.value == null || !Number.isFinite(entry.value)) continue;
      ticks.push({ ruleId: rule.id, checked: null, value: entry.value });
    } else {
      if (typeof entry.met !== "boolean") continue;
      ticks.push({ ruleId: rule.id, checked: entry.met, value: null });
    }
  }

  if (ticks.length > 0) {
    // coalesce on conflict, so writing a count rule's value can't blank a
    // checkbox already set on that same row, or the other way round.
    await sql`
      insert into rule_entries (day_log_id, rule_id, checked, value)
      select ${log.id}::uuid, r, c, v
      from unnest(
        ${ticks.map((t) => t.ruleId)}::uuid[],
        ${ticks.map((t) => t.checked)}::bool[],
        ${ticks.map((t) => t.value)}::float8[]
      ) as t(r, c, v)
      on conflict (day_log_id, rule_id) do update
        set checked = coalesce(excluded.checked, rule_entries.checked),
            value   = coalesce(excluded.value, rule_entries.value)
    `;
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

    const moves = (workout.exercises ?? []).slice(0, 30).filter((e) => e.name?.trim());
    if (moves.length > 0) {
      await sql`
        insert into exercises
          (workout_id, name, sets, reps, weight_kg, distance_km, minutes, notes, sort_order)
        select ${session.id}::uuid, n, st, rp, w, d, mn, nt, ord
        from unnest(
          ${moves.map((e) => e.name.trim().slice(0, 80))}::text[],
          ${moves.map((e) => clamp(e.sets, 50))}::int[],
          ${moves.map((e) => clamp(e.reps, 1000))}::int[],
          ${moves.map((e) =>
            positive(e.weight) == null
              ? null
              : statedToKg(e.weight!, e.weight_unit ?? null, user.units),
          )}::float8[],
          ${moves.map((e) =>
            positive(e.distance) == null
              ? null
              : statedToKm(e.distance!, e.distance_unit ?? null, user.units),
          )}::float8[],
          ${moves.map((e) => clamp(e.minutes, 600))}::int[],
          ${moves.map((e) => e.notes?.slice(0, 200) ?? null)}::text[],
          ${moves.map((_, i) => i)}::int[]
        ) as t(n, st, rp, w, d, mn, nt, ord)
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

