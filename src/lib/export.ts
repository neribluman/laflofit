import "server-only";
import {
  dayLogsBetween,
  entriesForLogs,
  exercisesForWorkouts,
  mealsBetween,
  measurementsFor,
  rulesForPlans,
  workoutsBetween,
  crewRoster,
} from "./data";
import { scoreDay } from "./scoring";
import { kgToDisplay, kmToDisplay, weightUnit, distanceUnit } from "./units";
import type { PlanRule, User } from "./types";

export type Format = "days" | "items" | "json" | "crew";

/**
 * Everything one person has logged, in three shapes.
 *
 * Three rather than one because the reasons people want their data out are
 * genuinely different, and a single file serves one of them badly:
 *
 * - `days` — a row per day. This is the one that opens in Sheets and draws a
 *   chart, which is what "can I see my history" usually means.
 * - `items` — a row per meal, session, lift and weigh-in. The detail behind
 *   the daily numbers, for anyone who wants to check the workings.
 * - `json` — the lot, nested and lossless, for a backup or moving elsewhere.
 *
 * `crew` is the fourth: everyone's daily numbers side by side, for a shared
 * spreadsheet. It holds nothing the crew page doesn't already show each
 * member — the leaderboard has been comparing their calories, protein and
 * weight all along — but a file travels further than a screen, so it is its
 * own deliberate choice rather than a variant of the personal ones.
 */

/**
 * RFC 4180: quote anything containing a comma, quote or newline, and double
 * any quote inside. A meal description like `2" of bread, buttered` breaks a
 * naive join, and silently — the file opens, the columns are just wrong.
 */
function cell(value: unknown): string {
  if (value == null) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const toCsv = (rows: unknown[][]): string =>
  // The BOM is not decoration: without it Excel reads UTF-8 as Latin-1 and
  // turns every accent and emoji in a food description into mojibake.
  "﻿" + rows.map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";

type Everything = Awaited<ReturnType<typeof gather>>;

async function gather(user: User) {
  const from = "1970-01-01";
  const to = "2999-12-31";

  const [logs, meals, workouts, measurements] = await Promise.all([
    dayLogsBetween([user.id], from, to),
    mealsBetween([user.id], from, to),
    workoutsBetween([user.id], from, to),
    measurementsFor([user.id]),
  ]);

  const [exercises, entries, rules] = await Promise.all([
    exercisesForWorkouts(workouts.map((w) => w.id)),
    entriesForLogs(logs.map((l) => l.id)),
    rulesForPlans([
      ...new Set(
        [user.active_plan_id, ...logs.map((l) => l.plan_id)].filter(
          (v): v is string => Boolean(v),
        ),
      ),
    ]),
  ]);

  return { logs, meals, workouts, measurements, exercises, entries, rules };
}

export async function exportFor(
  user: User,
  format: Format,
): Promise<{ body: string; filename: string; type: string }> {
  if (format === "crew") return crewExport(user);

  const all = await gather(user);
  const stamp = new Date().toISOString().slice(0, 10);
  const who = user.display_name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const name = `laflofit-${who}-${stamp}`;

  if (format === "json") {
    return {
      body: JSON.stringify(jsonShape(user, all), null, 2),
      filename: `${name}.json`,
      type: "application/json; charset=utf-8",
    };
  }

  const rows = format === "days" ? dayRows(user, all) : itemRows(user, all);
  return {
    body: toCsv(rows),
    filename: `${name}-${format}.csv`,
    type: "text/csv; charset=utf-8",
  };
}

/** One row per day: the shape you can chart. */
function dayRows(user: User, all: Everything): unknown[][] {
  const w = weightUnit(user.units);
  const rulesByPlan = new Map<string, PlanRule[]>();
  for (const rule of all.rules) {
    rulesByPlan.set(rule.plan_id, [...(rulesByPlan.get(rule.plan_id) ?? []), rule]);
  }
  const entriesByLog = new Map<string, typeof all.entries>();
  for (const entry of all.entries) {
    entriesByLog.set(entry.day_log_id, [
      ...(entriesByLog.get(entry.day_log_id) ?? []),
      entry,
    ]);
  }

  // Every date that has anything on it, not just the ones with a day_log —
  // a meal logged without ticking a rule is still a day that happened.
  const dates = [
    ...new Set([
      ...all.logs.map((l) => l.log_date),
      ...all.meals.map((m) => m.meal_date),
      ...all.workouts.map((x) => x.workout_date),
      ...all.measurements.filter((m) => m.weight_kg != null).map((m) => m.measured_on),
    ]),
  ].sort();

  const header = [
    "date", "weekday", "logged", "plan_percent",
    "calories", "protein_g", "carbs_g", "fat_g", "fibre_g", "items",
    "sessions", "training", "training_minutes",
    `weight_${w}`, "note",
  ];

  return [
    header,
    ...dates.map((date) => {
      const log = all.logs.find((l) => l.log_date === date);
      const meals = all.meals.filter((m) => m.meal_date === date);
      const sessions = all.workouts.filter((x) => x.workout_date === date);
      const weight = all.measurements.find(
        (m) => m.measured_on === date && m.weight_kg != null,
      );
      const score = log
        ? scoreDay(
            rulesByPlan.get(log.plan_id ?? user.active_plan_id ?? "") ?? [],
            entriesByLog.get(log.id) ?? [],
            true,
          )
        : null;
      const sum = (pick: (m: (typeof meals)[number]) => number | null) =>
        meals.reduce((total, meal) => total + (pick(meal) ?? 0), 0);

      return [
        date,
        new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", {
          weekday: "short",
          timeZone: "UTC",
        }),
        log ? "yes" : "no",
        score ? Math.round(score.ratio * 100) : "",
        meals.length ? sum((m) => m.calories) : "",
        meals.length ? sum((m) => m.protein_g) : "",
        meals.length ? sum((m) => m.carbs_g) : "",
        meals.length ? sum((m) => m.fat_g) : "",
        meals.length ? sum((m) => m.fibre_g) : "",
        meals.length,
        sessions.length,
        sessions.map((s) => s.kind).join(" + "),
        sessions.reduce((total, s) => total + (s.minutes ?? 0), 0) || "",
        weight?.weight_kg != null
          ? kgToDisplay(weight.weight_kg, user.units).toFixed(1)
          : "",
        log?.note ?? "",
      ];
    }),
  ];
}

/** One row per thing: every meal, session, lift and weigh-in. */
function itemRows(user: User, all: Everything): unknown[][] {
  const w = weightUnit(user.units);
  const d = distanceUnit(user.units);
  const owner = new Map(all.workouts.map((x) => [x.id, x]));

  const header = [
    "date", "type", "description",
    "calories", "protein_g", "carbs_g", "fat_g", "fibre_g", "estimated",
    "kind", "intensity", "minutes",
    "sets", "reps", `load_${w}`, `distance_${d}`,
  ];

  const rows: unknown[][] = [
    ...all.meals.map((m) => [
      m.meal_date, "meal", m.description,
      m.calories ?? "", m.protein_g ?? "", m.carbs_g ?? "", m.fat_g ?? "",
      m.fibre_g ?? "", m.estimated ? "estimated" : "stated",
      m.slot ?? "", "", "", "", "", "", "",
    ]),
    ...all.workouts.map((x) => [
      x.workout_date, "session", x.notes ?? "",
      "", "", "", "", "", "",
      x.kind, x.intensity, x.minutes ?? "", "", "", "", "",
    ]),
    ...all.exercises.map((e) => {
      const session = owner.get(e.workout_id);
      return [
        session?.workout_date ?? "", "exercise", e.name,
        "", "", "", "", "", "",
        session?.kind ?? "", "", e.minutes ?? "",
        e.sets ?? "", e.reps ?? "",
        e.weight_kg != null ? kgToDisplay(e.weight_kg, user.units).toFixed(1) : "",
        e.distance_km != null ? kmToDisplay(e.distance_km, user.units).toFixed(2) : "",
      ];
    }),
    ...all.measurements
      .filter((m) => m.weight_kg != null)
      .map((m) => [
        m.measured_on, "weigh-in", "",
        "", "", "", "", "", "",
        "", "", "", "", "",
        kgToDisplay(m.weight_kg!, user.units).toFixed(1), "",
      ]),
  ];

  // Oldest first, and stable within a day so a session sits with its lifts.
  rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return [header, ...rows];
}

/**
 * Three decimals: a gram on a bodyweight, a gram on a barbell. Storing more is
 * float noise from converting pounds — nobody wants to read 83.9145884518566
 * in their own backup, and no scale on earth justifies the other twelve digits.
 */
const grams = (value: number | null) =>
  value == null ? null : Math.round(value * 1000) / 1000;

/** Nested and complete: a backup, or the input to somewhere else. */
function jsonShape(user: User, all: Everything) {
  return {
    exported_at: new Date().toISOString(),
    app: "LaFloFit",
    note:
      "Weights are kilograms and distances kilometres, regardless of the units shown in the app.",
    person: {
      name: user.display_name,
      units: user.units,
      timezone: user.timezone,
      height_cm: user.height_cm,
      birth_year: user.birth_year,
      sex: user.sex,
      activity_level: user.activity_level,
      goal_weight_kg: grams(user.goal_weight_kg),
      about: user.about,
    },
    plan_rules: all.rules.map((r) => ({
      id: r.id, label: r.label, kind: r.kind,
      target: r.target, unit: r.unit, cadence: r.cadence, points: r.points,
    })),
    days: all.logs.map((log) => ({
      date: log.log_date,
      note: log.note,
      rules: all.entries
        .filter((e) => e.day_log_id === log.id)
        .map((e) => ({
          rule: all.rules.find((r) => r.id === e.rule_id)?.label ?? e.rule_id,
          checked: e.checked,
          value: e.value,
        })),
    })),
    meals: all.meals.map((m) => ({
      date: m.meal_date, description: m.description, slot: m.slot,
      calories: m.calories, protein_g: m.protein_g, carbs_g: m.carbs_g,
      fat_g: m.fat_g, fibre_g: m.fibre_g, estimated: m.estimated,
    })),
    workouts: all.workouts.map((x) => ({
      date: x.workout_date, kind: x.kind, minutes: x.minutes,
      intensity: x.intensity, notes: x.notes,
      exercises: all.exercises
        .filter((e) => e.workout_id === x.id)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((e) => ({
          name: e.name, sets: e.sets, reps: e.reps,
          weight_kg: grams(e.weight_kg), distance_km: grams(e.distance_km),
          minutes: e.minutes, notes: e.notes,
        })),
    })),
    measurements: all.measurements.map((m) => ({
      date: m.measured_on, weight_kg: grams(m.weight_kg),
      body_fat: m.body_fat, waist_cm: grams(m.waist_cm), resting_hr: m.resting_hr,
      notes: m.notes,
    })),
  };
}

/**
 * Everyone's days in one sheet, for comparing.
 *
 * Weights convert to the units of whoever asked, not each member's own — a
 * column silently mixing kilos and pounds is worse than no column, and it's
 * the sort of thing nobody notices until a chart looks mad.
 */
async function crewExport(
  user: User,
): Promise<{ body: string; filename: string; type: string }> {
  const roster = await crewRoster(user.crew_id);
  const ids = roster.map((m) => m.id);
  const from = "1970-01-01";
  const to = "2999-12-31";

  const [logs, meals, workouts, measurements] = await Promise.all([
    dayLogsBetween(ids, from, to),
    mealsBetween(ids, from, to),
    workoutsBetween(ids, from, to),
    measurementsFor(ids),
  ]);
  const [entries, rules] = await Promise.all([
    entriesForLogs(logs.map((l) => l.id)),
    rulesForPlans([
      ...new Set(
        [...roster.map((m) => m.active_plan_id), ...logs.map((l) => l.plan_id)].filter(
          (v): v is string => Boolean(v),
        ),
      ),
    ]),
  ]);

  const rulesByPlan = new Map<string, PlanRule[]>();
  for (const rule of rules) {
    rulesByPlan.set(rule.plan_id, [...(rulesByPlan.get(rule.plan_id) ?? []), rule]);
  }
  const entriesByLog = new Map<string, typeof entries>();
  for (const entry of entries) {
    entriesByLog.set(entry.day_log_id, [
      ...(entriesByLog.get(entry.day_log_id) ?? []),
      entry,
    ]);
  }

  const w = weightUnit(user.units);
  const header = [
    "person", "date", "weekday", "logged", "plan_percent",
    "calories", "protein_g", "carbs_g", "fat_g", "fibre_g", "items",
    "sessions", "training", "training_minutes", `weight_${w}`, "note",
  ];
  const body: unknown[][] = [];

  for (const member of roster) {
    const dates = [
      ...new Set([
        ...logs.filter((l) => l.user_id === member.id).map((l) => l.log_date),
        ...meals.filter((m) => m.user_id === member.id).map((m) => m.meal_date),
        ...workouts.filter((x) => x.user_id === member.id).map((x) => x.workout_date),
        ...measurements
          .filter((m) => m.user_id === member.id && m.weight_kg != null)
          .map((m) => m.measured_on),
      ]),
    ];

    for (const date of dates) {
      const log = logs.find((l) => l.user_id === member.id && l.log_date === date);
      const theirMeals = meals.filter(
        (m) => m.user_id === member.id && m.meal_date === date,
      );
      const sessions = workouts.filter(
        (x) => x.user_id === member.id && x.workout_date === date,
      );
      const weigh = measurements.find(
        (m) => m.user_id === member.id && m.measured_on === date && m.weight_kg != null,
      );
      const score = log
        ? scoreDay(
            rulesByPlan.get(log.plan_id ?? member.active_plan_id ?? "") ?? [],
            entriesByLog.get(log.id) ?? [],
            true,
          )
        : null;
      const sum = (pick: (m: (typeof theirMeals)[number]) => number | null) =>
        theirMeals.reduce((total, meal) => total + (pick(meal) ?? 0), 0);

      body.push([
        member.display_name,
        date,
        new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", {
          weekday: "short",
          timeZone: "UTC",
        }),
        log ? "yes" : "no",
        score ? Math.round(score.ratio * 100) : "",
        theirMeals.length ? sum((m) => m.calories) : "",
        theirMeals.length ? sum((m) => m.protein_g) : "",
        theirMeals.length ? sum((m) => m.carbs_g) : "",
        theirMeals.length ? sum((m) => m.fat_g) : "",
        theirMeals.length ? sum((m) => m.fibre_g) : "",
        theirMeals.length,
        sessions.length,
        sessions.map((x) => x.kind).join(" + "),
        sessions.reduce((total, x) => total + (x.minutes ?? 0), 0) || "",
        weigh?.weight_kg != null ? kgToDisplay(weigh.weight_kg, user.units).toFixed(1) : "",
        log?.note ?? "",
      ]);
    }
  }

  // Grouped by date, then name: a shared sheet should read as "here is Tuesday
  // for everyone", not one person's whole history followed by the next.
  body.sort(
    (a, b) =>
      String(a[1]).localeCompare(String(b[1])) ||
      String(a[0]).localeCompare(String(b[0])),
  );

  return {
    body: toCsv([header, ...body]),
    filename: `laflofit-crew-${new Date().toISOString().slice(0, 10)}.csv`,
    type: "text/csv; charset=utf-8",
  };
}
