"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sql, sqlOne } from "@/lib/db";
import { currentUser } from "@/lib/data";
import { endSession } from "@/lib/session";
import { displayToCm, displayToKg, kgToDisplay, weightUnit } from "@/lib/units";
import type { User } from "@/lib/types";

// There is no row-level security here the way there was on Supabase, so every
// write below is scoped to the signed-in user explicitly. Read that as: any
// query that changes data must mention user_id, or it is a bug.

async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

/** Find or create the day_log row for a date, so entries have something to hang off. */
async function ensureDayLog(user: User, date: string): Promise<string> {
  const row = await sqlOne<{ id: string }>`
    insert into day_logs (user_id, log_date, plan_id)
    values (${user.id}, ${date}::date, ${user.active_plan_id})
    on conflict (user_id, log_date) do update set updated_at = now()
    returning id
  `;
  if (!row) throw new Error("Could not open that day.");
  return row.id;
}

/** The rule must belong to a plan this user actually follows or shares. */
async function assertRuleVisible(user: User, ruleId: string) {
  const row = await sqlOne`
    select 1 from plan_rules r
    join plans p on p.id = r.plan_id
    left join users u on u.id = p.owner_id
    where r.id = ${ruleId}
      and (p.owner_id = ${user.id} or p.crew_id = ${user.crew_id}
           or u.crew_id = ${user.crew_id})
  `;
  if (!row) throw new Error("That rule isn't part of your plan.");
}

export async function setRuleChecked(
  date: string,
  ruleId: string,
  checked: boolean,
) {
  const user = await requireUser();
  await assertRuleVisible(user, ruleId);
  const logId = await ensureDayLog(user, date);

  await sql`
    insert into rule_entries (day_log_id, rule_id, checked)
    values (${logId}, ${ruleId}, ${checked})
    on conflict (day_log_id, rule_id) do update set checked = excluded.checked
  `;

  revalidatePath("/today");
  revalidatePath("/crew");
}

export async function setRuleValue(
  date: string,
  ruleId: string,
  value: number | null,
) {
  const user = await requireUser();
  await assertRuleVisible(user, ruleId);
  const logId = await ensureDayLog(user, date);

  await sql`
    insert into rule_entries (day_log_id, rule_id, value)
    values (${logId}, ${ruleId}, ${value})
    on conflict (day_log_id, rule_id) do update set value = excluded.value
  `;

  revalidatePath("/today");
  revalidatePath("/crew");
}

export async function setDayNote(date: string, note: string) {
  const user = await requireUser();
  const logId = await ensureDayLog(user, date);
  await sql`
    update day_logs set note = ${note.trim().slice(0, 500) || null}
    where id = ${logId} and user_id = ${user.id}
  `;
  revalidatePath("/today");
  revalidatePath("/crew");
}

export async function addWorkout(formData: FormData) {
  const user = await requireUser();
  const minutesRaw = String(formData.get("minutes") ?? "").trim();
  const minutes = minutesRaw
    ? Math.max(0, Math.min(600, Math.round(Number(minutesRaw))))
    : null;

  await sql`
    insert into workouts (user_id, workout_date, kind, minutes, intensity, notes)
    values (
      ${user.id},
      ${String(formData.get("workout_date"))}::date,
      ${String(formData.get("kind") ?? "Other")},
      ${Number.isFinite(minutes) ? minutes : null},
      ${String(formData.get("intensity") ?? "moderate")},
      ${String(formData.get("notes") ?? "").trim().slice(0, 300) || null}
    )
  `;

  revalidatePath("/log");
  revalidatePath("/crew");
  revalidatePath("/me");
}

export async function deleteWorkout(id: string) {
  const user = await requireUser();
  await sql`delete from workouts where id = ${id} and user_id = ${user.id}`;
  revalidatePath("/log");
  revalidatePath("/crew");
}

export async function saveMeasurement(formData: FormData) {
  const user = await requireUser();

  const num = (key: string) => {
    const raw = String(formData.get(key) ?? "").trim();
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };

  const weight = num("weight");
  const waist = num("waist");
  const bodyFat = num("body_fat");
  if (weight == null && waist == null && bodyFat == null) return;

  await sql`
    insert into measurements
      (user_id, measured_on, weight_kg, waist_cm, body_fat, notes)
    values (
      ${user.id},
      ${String(formData.get("measured_on"))}::date,
      ${weight == null ? null : displayToKg(weight, user.units)},
      ${waist == null ? null : displayToCm(waist, user.units)},
      ${bodyFat},
      ${String(formData.get("notes") ?? "").trim().slice(0, 300) || null}
    )
    on conflict (user_id, measured_on) do update set
      weight_kg = excluded.weight_kg,
      waist_cm  = excluded.waist_cm,
      body_fat  = excluded.body_fat,
      notes     = excluded.notes
  `;

  revalidatePath("/log");
  revalidatePath("/me");
  revalidatePath("/crew");
}

/** You may only react to or comment on things your own crew logged. */
async function assertTargetInCrew(
  user: User,
  targetType: string,
  targetId: string,
) {
  const table = targetType === "workout" ? "workouts" : "day_logs";
  const row =
    table === "workouts"
      ? await sqlOne`
          select 1 from workouts w join users u on u.id = w.user_id
          where w.id = ${targetId} and u.crew_id = ${user.crew_id}
        `
      : await sqlOne`
          select 1 from day_logs d join users u on u.id = d.user_id
          where d.id = ${targetId} and u.crew_id = ${user.crew_id}
        `;
  if (!row) throw new Error("That isn't something your crew logged.");
}

export async function postComment(
  targetType: string,
  targetId: string,
  body: string,
) {
  const user = await requireUser();
  const text = body.trim().slice(0, 400);
  if (!text) return;
  await assertTargetInCrew(user, targetType, targetId);

  await sql`
    insert into comments (user_id, target_type, target_id, body)
    values (${user.id}, ${targetType}, ${targetId}, ${text})
  `;
  revalidatePath("/crew");
}

export async function toggleReaction(
  targetType: string,
  targetId: string,
  emoji: string,
) {
  const user = await requireUser();
  await assertTargetInCrew(user, targetType, targetId);

  const deleted = await sql`
    delete from reactions
    where user_id = ${user.id} and target_type = ${targetType}
      and target_id = ${targetId} and emoji = ${emoji}
    returning id
  `;

  if (deleted.length === 0) {
    await sql`
      insert into reactions (user_id, target_type, target_id, emoji)
      values (${user.id}, ${targetType}, ${targetId}, ${emoji})
      on conflict do nothing
    `;
  }
  revalidatePath("/crew");
}

export async function updateProfile(formData: FormData) {
  const user = await requireUser();
  const name = String(formData.get("display_name") ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 40);
  if (name.length < 2) return;

  await sql`
    update users set
      display_name = ${name},
      emoji = ${String(formData.get("emoji") ?? "💪").slice(0, 8)},
      units = ${formData.get("units") === "imperial" ? "imperial" : "metric"}
    where id = ${user.id}
  `;
  revalidatePath("/", "layout");
}

export async function signOut() {
  await endSession();
  redirect("/login");
}

// ---------------------------------------------------------------------------
// Deleting things
// ---------------------------------------------------------------------------

export type DaySummary = {
  ticks: number;
  hasNote: boolean;
  workouts: { kind: string; minutes: number | null }[];
  /** Already converted to the user's display units. */
  weight: string | null;
};

/** What a reset would actually remove. Read-only — used to fill the warning. */
export async function describeDay(date: string): Promise<DaySummary> {
  const user = await requireUser();

  const [ticks, note, workouts, weights] = await Promise.all([
    sqlOne<{ n: number }>`
      select count(*)::int as n from rule_entries re
      join day_logs d on d.id = re.day_log_id
      where d.user_id = ${user.id} and d.log_date = ${date}::date
        and (re.checked is not null or re.value is not null)
    `,
    sqlOne<{ note: string | null }>`
      select note from day_logs
      where user_id = ${user.id} and log_date = ${date}::date
    `,
    sql<{ kind: string; minutes: number | null }>`
      select kind, minutes from workouts
      where user_id = ${user.id} and workout_date = ${date}::date
      order by created_at
    `,
    sqlOne<{ weight_kg: number | null }>`
      select weight_kg::float8 as weight_kg from measurements
      where user_id = ${user.id} and measured_on = ${date}::date
    `,
  ]);

  return {
    ticks: ticks?.n ?? 0,
    hasNote: Boolean(note?.note),
    workouts,
    weight:
      weights?.weight_kg == null
        ? null
        : `${kgToDisplay(weights.weight_kg, user.units).toFixed(1)} ${weightUnit(user.units)}`,
  };
}

/**
 * Wipe one day back to never-logged: ticks, note, workouts and weigh-in.
 * Reactions and comments are keyed by target id rather than a foreign key, so
 * they have to be cleared by hand or they outlive what they were about.
 */
export async function resetDay(date: string) {
  const user = await requireUser();

  const logs = await sql<{ id: string }>`
    delete from day_logs
    where user_id = ${user.id} and log_date = ${date}::date
    returning id
  `;
  const workouts = await sql<{ id: string }>`
    delete from workouts
    where user_id = ${user.id} and workout_date = ${date}::date
    returning id
  `;
  await sql`
    delete from measurements
    where user_id = ${user.id} and measured_on = ${date}::date
  `;

  const orphans = [...logs, ...workouts].map((row) => row.id);
  if (orphans.length > 0) {
    await sql`delete from reactions where target_id = any(${orphans}::uuid[])`;
    await sql`delete from comments  where target_id = any(${orphans}::uuid[])`;
  }

  revalidatePath("/today");
  revalidatePath("/log");
  revalidatePath("/crew");
  revalidatePath("/me");
}

export async function deleteMeasurement(id: string) {
  const user = await requireUser();
  await sql`delete from measurements where id = ${id} and user_id = ${user.id}`;
  revalidatePath("/log");
  revalidatePath("/me");
  revalidatePath("/crew");
}
