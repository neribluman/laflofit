import "server-only";
import { sql, sqlOne } from "@/lib/db";
import {
  dayLogsBetween,
  mealsBetween,
  measurementsFor,
  planWithRules,
  workoutsBetween,
} from "@/lib/data";
import { addDays, todayIn } from "@/lib/dates";
import { canInterpret } from "@/lib/interpret";
import { describePerson } from "@/lib/profile";
import { macroTotals } from "@/lib/macros";
import { readIntent } from "@/lib/assistant";
import { applyReportFor, readDayFor } from "@/lib/log";
import { fmtWeight, kgToDisplay, weightUnit } from "@/lib/units";
import type { User } from "@/lib/types";

/** WhatsApp gives numbers without a plus; store and compare them that way. */
const normalise = (phone: string) => phone.replace(/\D/g, "");

async function userForPhone(phone: string): Promise<User | null> {
  return sqlOne<User>`
    select id, crew_id, display_name, emoji, units, timezone,
           height_cm::float8 as height_cm, birth_year, sex, activity_level,
           goal_weight_kg::float8 as goal_weight_kg, about,
           (avatar is not null) as has_avatar, active_plan_id,
           created_at::text as created_at
    from users where phone = ${normalise(phone)}
  `;
}

/**
 * "LINK ABC123" from a number we don't know yet.
 *
 * The code is single use and short-lived, and claiming it moves the number
 * onto that account — including taking it off any account that had it before,
 * so a recycled phone number can't end up writing to a stranger's diary.
 */
async function tryLink(phone: string, text: string): Promise<string | null> {
  const match = text.trim().match(/^link\s+([a-z0-9]{6})$/i);
  if (!match) return null;

  const code = match[1].toUpperCase();
  const link = await sqlOne<{ user_id: string }>`
    delete from phone_links
    where code = ${code} and expires_at > now()
    returning user_id
  `;
  if (!link) {
    return "That code has expired or isn't right. Open the app, go to Me, and tap Connect WhatsApp for a fresh one.";
  }

  await sql`update users set phone = null where phone = ${normalise(phone)}`;
  await sql`update users set phone = ${normalise(phone)} where id = ${link.user_id}`;

  const user = await sqlOne<{ display_name: string }>`
    select display_name from users where id = ${link.user_id}
  `;
  return `Connected — hello ${user?.display_name ?? "there"}. Just tell me what you ate or trained and I'll log it. You can ask me things too, like "how am I doing this week?".`;
}

/** Everything the assistant needs to answer a question about them. */
async function context(user: User, today: string) {
  const from = addDays(today, -13);
  const [meals, workouts, measurements, logs] = await Promise.all([
    mealsBetween([user.id], from, today),
    workoutsBetween([user.id], from, today),
    measurementsFor([user.id]),
    dayLogsBetween([user.id], from, today),
  ]);

  const latestWeight =
    [...measurements].reverse().find((m) => m.weight_kg != null)?.weight_kg ?? null;

  const byDate = new Map<string, string[]>();
  for (const meal of meals) {
    const totals = macroTotals([meal]);
    byDate.set(meal.meal_date, [
      ...(byDate.get(meal.meal_date) ?? []),
      `${meal.description} (${totals.calories} kcal, ${totals.protein}g P)`,
    ]);
  }
  for (const workout of workouts) {
    byDate.set(workout.workout_date, [
      ...(byDate.get(workout.workout_date) ?? []),
      `TRAINED: ${workout.kind}${workout.minutes ? ` ${workout.minutes} min` : ""} (${workout.intensity})`,
    ]);
  }
  for (const m of measurements) {
    if (m.weight_kg == null || m.measured_on < from) continue;
    byDate.set(m.measured_on, [
      ...(byDate.get(m.measured_on) ?? []),
      `WEIGH-IN: ${fmtWeight(m.weight_kg, user.units)}`,
    ]);
  }

  const days = [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, items]) => `${date}${date === today ? " (today)" : ""}\n  ${items.join("\n  ")}`);

  return {
    person: describePerson(user, latestWeight, today),
    logged: days.length
      ? `${logs.length} days logged in the last fortnight.\n\n${days.join("\n")}`
      : "Nothing logged in the last fortnight.",
  };
}

/** What the app wrote, said back to them so they can catch a mistake. */
function receiptFor(report: Awaited<ReturnType<typeof readDayFor>>, user: User): string {
  if (!report.ok) return report.error;

  const totals = macroTotals(report.report.meals);
  const parts: string[] = [];

  if (report.report.meals.length > 0) {
    parts.push(
      `${report.report.meals.length} item${report.report.meals.length === 1 ? "" : "s"} — ` +
        `${totals.calories.toLocaleString()} kcal, ${totals.protein}g protein`,
    );
  }
  for (const workout of report.report.workouts) {
    parts.push(
      `${workout.kind}${workout.minutes ? ` ${workout.minutes} min` : ""} (${workout.intensity})`,
    );
  }
  if (report.report.weight != null) {
    parts.push(`weighed ${report.report.weight} ${report.report.weight_unit ?? weightUnit(user.units)}`);
  }
  for (const entry of report.report.rules) {
    if (entry.value != null) parts.push(`${report.labels[entry.rule_id]}: ${entry.value}`);
  }

  if (parts.length === 0) {
    return "I couldn't find anything to log in that. Try naming what you ate, what you trained, or what you weighed.";
  }

  const unclear = report.report.unclear.length
    ? `\n\nNot sure about: ${report.report.unclear.join("; ")}`
    : "";

  return `Logged ✓\n${parts.map((p) => `• ${p}`).join("\n")}${unclear}`;
}

/**
 * One inbound message, start to finish. Returns the reply to send, or null to
 * stay silent.
 */
export async function handleMessage(phone: string, text: string): Promise<string | null> {
  const linked = await tryLink(phone, text);
  if (linked) return linked;

  const user = await userForPhone(phone);
  if (!user) {
    // Say nothing about who is or isn't in the system to an unknown number.
    return "I don't recognise this number yet. Open LaFloFit, go to Me, and tap Connect WhatsApp — then send me the code it shows you.";
  }

  if (!canInterpret()) return "I can't read messages right now — the app's AI key isn't set up.";
  if (!user.active_plan_id) return "You don't have a plan yet. Open the app and pick one, then I can log against it.";

  const today = todayIn(user.timezone);

  if (/^(stop|unlink|disconnect)$/i.test(text.trim())) {
    await sql`update users set phone = null where id = ${user.id}`;
    return "Disconnected. This number won't reach your account any more. Reconnect any time from the Me tab.";
  }

  const planned = await planWithRules(user.active_plan_id);
  const { person, logged } = await context(user, today);

  const intent = await readIntent({
    text: text.slice(0, 2000),
    person,
    plan:
      planned?.rules
        .map(
          (rule) =>
            `  · ${rule.label}${rule.target != null ? ` — target ${rule.target}${rule.unit ?? ""}` : ""}`,
        )
        .join("\n") ?? "  (no plan)",
    logged,
  });

  if (intent.kind !== "log") {
    return intent.reply || "Not sure what to do with that one.";
  }

  const read = await readDayFor(user, today, text);
  if (!read.ok) return read.error;

  await applyReportFor(user, today, read.report);
  return receiptFor(read, user);
}

/** A fresh six-character code for the Me tab, good for fifteen minutes. */
export async function issueLinkCode(userId: string): Promise<string> {
  // No I, O, 0 or 1: this gets read off a screen and typed into a phone.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const code = Array.from(
    crypto.getRandomValues(new Uint8Array(6)),
    (n) => alphabet[n % alphabet.length],
  ).join("");

  await sql`delete from phone_links where user_id = ${userId} or expires_at < now()`;
  await sql`
    insert into phone_links (code, user_id, expires_at)
    values (${code}, ${userId}, now() + interval '15 minutes')
  `;
  return code;
}

export { normalise as normalisePhone, kgToDisplay };
