"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { currentUser } from "@/lib/data";
import { displayToCm, displayToKg } from "@/lib/units";
import type { User } from "@/lib/types";

async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

/** Editing your details later, from Me. */
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

export type IntakeAnswers = {
  age: string;
  sex: string;
  height: string;
  weight: string;
  goalWeight: string;
  activity: string;
  about: string;
};

/**
 * The onboarding survey. Separate from saveProfileFields because this one also
 * records the current weight as a real weigh-in — it is the first point on the
 * chart, not just a number on the profile.
 */
export async function saveIntake(answers: IntakeAnswers, thisYear: number) {
  const user = await requireUser();

  const num = (raw: string) => {
    const parsed = Number(String(raw).trim());
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  };

  const age = num(answers.age);
  const height = num(answers.height);
  const weight = num(answers.weight);
  const goal = num(answers.goalWeight);
  const about = answers.about.trim().slice(0, 600);

  await sql`
    update users set
      birth_year     = ${age && age < 120 ? thisYear - Math.round(age) : null},
      sex            = ${["male", "female", "other"].includes(answers.sex) ? answers.sex : null},
      height_cm      = ${height == null ? null : displayToCm(height, user.units)},
      goal_weight_kg = ${goal == null ? null : displayToKg(goal, user.units)},
      activity_level = ${
        ["sedentary", "light", "moderate", "very"].includes(answers.activity)
          ? answers.activity
          : null
      },
      about          = ${about || null}
    where id = ${user.id}
  `;

  if (weight != null) {
    await sql`
      insert into measurements (user_id, measured_on, weight_kg)
      values (${user.id}, current_date, ${displayToKg(weight, user.units)})
      on conflict (user_id, measured_on) do update set weight_kg = excluded.weight_kg
    `;
  }

  revalidatePath("/", "layout");
}
