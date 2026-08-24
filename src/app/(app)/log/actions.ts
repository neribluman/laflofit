"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sql, sqlOne } from "@/lib/db";
import { currentUser } from "@/lib/data";
import { interpretWorkout, type WorkoutReport } from "@/lib/interpret";
import { displayToKg, displayToKm } from "@/lib/units";
import { WORKOUT_KINDS } from "@/lib/presets";
import type { User } from "@/lib/types";

export type ReadWorkoutResult =
  | { ok: true; report: WorkoutReport }
  | { ok: false; error: string };

async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

const whole = (value: number | null | undefined, max: number) =>
  value == null || !Number.isFinite(value)
    ? null
    : Math.max(0, Math.min(max, Math.round(value)));

const decimal = (value: number | null | undefined) =>
  value == null || !Number.isFinite(value) || value < 0 ? null : value;

/** Read a session into a proposal. Writes nothing — the user confirms first. */
export async function readWorkout(text: string): Promise<ReadWorkoutResult> {
  const user = await requireUser();
  const trimmed = text.trim();
  if (trimmed.length < 3) return { ok: false, error: "Tell me a bit more." };

  try {
    return {
      ok: true,
      report: await interpretWorkout({
        text: trimmed.slice(0, 2000),
        units: user.units,
      }),
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

/** Apply a session the user has confirmed. */
export async function applyWorkout(date: string, report: WorkoutReport) {
  const user = await requireUser();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;

  for (const workout of report.workouts.slice(0, 5)) {
    if (!WORKOUT_KINDS.includes(workout.kind)) continue;

    const row = await sqlOne<{ id: string }>`
      insert into workouts (user_id, workout_date, kind, minutes, intensity, notes)
      values (
        ${user.id}, ${date}::date, ${workout.kind}, ${whole(workout.minutes, 600)},
        ${["easy", "moderate", "hard"].includes(workout.intensity) ? workout.intensity : "moderate"},
        ${workout.notes?.slice(0, 300) ?? null}
      )
      returning id
    `;
    if (!row) continue;

    for (const [i, exercise] of workout.exercises.slice(0, 30).entries()) {
      if (!exercise.name?.trim()) continue;
      await sql`
        insert into exercises
          (workout_id, name, sets, reps, weight_kg, distance_km, minutes, notes, sort_order)
        values (
          ${row.id}, ${exercise.name.trim().slice(0, 80)},
          ${whole(exercise.sets, 50)}, ${whole(exercise.reps, 1000)},
          ${exercise.weight == null ? null : displayToKg(decimal(exercise.weight) ?? 0, user.units)},
          ${exercise.distance == null ? null : displayToKm(decimal(exercise.distance) ?? 0, user.units)},
          ${whole(exercise.minutes, 600)},
          ${exercise.notes?.slice(0, 200) ?? null},
          ${i}
        )
      `;
    }
  }

  revalidatePath("/log");
  revalidatePath("/today");
  revalidatePath("/crew");
  revalidatePath("/me");
}
