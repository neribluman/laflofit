"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { currentUser } from "@/lib/data";
import { interpretProfile, type ProfileReport } from "@/lib/interpret";
import { displayToCm, displayToKg } from "@/lib/units";
import type { User } from "@/lib/types";

export type ReadProfileResult =
  | { ok: true; report: ProfileReport }
  | { ok: false; error: string };

async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

/** Read a self-description into a proposal. Writes nothing. */
export async function readProfile(text: string): Promise<ReadProfileResult> {
  const user = await requireUser();
  const trimmed = text.trim();
  if (trimmed.length < 3) return { ok: false, error: "Tell me a bit more." };

  try {
    return {
      ok: true,
      report: await interpretProfile({
        text: trimmed.slice(0, 1500),
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

const positive = (value: number | null | undefined) =>
  value != null && Number.isFinite(value) && value > 0 ? value : null;

/**
 * Save a profile. Every field is optional and a blank never clears an existing
 * value — filling in one thing should not quietly erase another.
 */
export async function saveProfile(report: ProfileReport, thisYear: number) {
  const user = await requireUser();

  const age = positive(report.age);
  const birthYear = age && age < 120 ? thisYear - Math.round(age) : null;
  const height = positive(report.height);
  const goal = positive(report.goal_weight);
  const weight = positive(report.weight);

  await sql`
    update users set
      birth_year     = coalesce(${birthYear}, birth_year),
      sex            = coalesce(${["male", "female", "other"].includes(report.sex ?? "") ? report.sex : null}, sex),
      height_cm      = coalesce(${height == null ? null : displayToCm(height, user.units)}, height_cm),
      goal_weight_kg = coalesce(${goal == null ? null : displayToKg(goal, user.units)}, goal_weight_kg),
      activity_level = coalesce(
        ${["sedentary", "light", "moderate", "very"].includes(report.activity_level ?? "") ? report.activity_level : null},
        activity_level
      ),
      about          = coalesce(${report.about?.trim().slice(0, 600) || null}, about)
    where id = ${user.id}
  `;

  // A weight mentioned here is a real weigh-in, so record it as one.
  if (weight != null) {
    await sql`
      insert into measurements (user_id, measured_on, weight_kg)
      values (${user.id}, current_date, ${displayToKg(weight, user.units)})
      on conflict (user_id, measured_on) do update set
        weight_kg = coalesce(excluded.weight_kg, measurements.weight_kg)
    `;
  }

  revalidatePath("/", "layout");
}

/** The by-hand version of the same thing. */
export async function saveProfileFields(formData: FormData) {
  const user = await requireUser();

  const num = (key: string) => {
    const raw = String(formData.get(key) ?? "").trim();
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  };

  const age = num("age");
  const thisYear = Number(String(formData.get("this_year") ?? "")) || null;
  const height = num("height");
  const goal = num("goal_weight");
  const sex = String(formData.get("sex") ?? "");
  const activity = String(formData.get("activity_level") ?? "");
  const about = String(formData.get("about") ?? "").trim().slice(0, 600);

  await sql`
    update users set
      birth_year     = ${age && thisYear ? thisYear - Math.round(age) : null},
      sex            = ${["male", "female", "other"].includes(sex) ? sex : null},
      height_cm      = ${height == null ? null : displayToCm(height, user.units)},
      goal_weight_kg = ${goal == null ? null : displayToKg(goal, user.units)},
      activity_level = ${["sedentary", "light", "moderate", "very"].includes(activity) ? activity : null},
      about          = ${about || null}
    where id = ${user.id}
  `;

  revalidatePath("/", "layout");
}
