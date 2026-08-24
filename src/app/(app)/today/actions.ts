"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sql, sqlOne } from "@/lib/db";
import { currentUser, planWithRules } from "@/lib/data";
import { interpretDay, type DayReport } from "@/lib/interpret";
import { displayToKg } from "@/lib/units";
import { WORKOUT_KINDS } from "@/lib/presets";
import type { User } from "@/lib/types";

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

  try {
    const report = await interpretDay({
      text: trimmed.slice(0, 2000),
      rules: planned.rules,
      units: user.units,
      alreadyLogged: logged.map((row) => row.label),
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

  for (const entry of report.rules) {
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
    await sql`
      insert into workouts (user_id, workout_date, kind, minutes, intensity, notes)
      values (
        ${user.id}, ${date}::date, ${workout.kind},
        ${workout.minutes == null ? null : Math.max(0, Math.min(600, Math.round(workout.minutes)))},
        ${["easy", "moderate", "hard"].includes(workout.intensity) ? workout.intensity : "moderate"},
        ${workout.notes?.slice(0, 300) ?? null}
      )
    `;
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
  revalidatePath("/log");
  revalidatePath("/crew");
  revalidatePath("/me");
}
