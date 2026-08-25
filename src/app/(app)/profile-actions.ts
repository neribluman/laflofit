"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { currentUser } from "@/lib/data";
import { displayToCm, displayToKg, feetInchesToCm } from "@/lib/units";
import type { Units, User } from "@/lib/types";

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
  /** Marker only. The photo saves itself the moment it's taken. */
  photo: string;
  /** Chosen during the survey — everything below is in these units. */
  units: "metric" | "imperial";
  age: string;
  heightFeet: string;
  heightInches: string;
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
  const zeroOk = (raw: string) => {
    const parsed = Number(String(raw).trim());
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  };

  // Convert with the units chosen in the survey, not whatever the account
  // happened to be set to beforehand.
  const units: Units =
    answers.units === "imperial" ? "imperial" : "metric";

  const age = num(answers.age);
  const weight = num(answers.weight);
  const goal = num(answers.goalWeight);
  const about = answers.about.trim().slice(0, 600);

  const heightCm =
    units === "imperial"
      ? num(answers.heightFeet)
        ? feetInchesToCm(num(answers.heightFeet)!, zeroOk(answers.heightInches))
        : null
      : num(answers.height);

  await sql`update users set units = ${units} where id = ${user.id}`;

  await sql`
    update users set
      birth_year     = ${age && age < 120 ? thisYear - Math.round(age) : null},
      sex            = ${["male", "female", "other"].includes(answers.sex) ? answers.sex : null},
      height_cm      = ${heightCm},
      goal_weight_kg = ${goal == null ? null : displayToKg(goal, units)},
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
      values (${user.id}, current_date, ${displayToKg(weight, units)})
      on conflict (user_id, measured_on) do update set weight_kg = excluded.weight_kg
    `;
  }

  revalidatePath("/", "layout");
}

/** Store a photo. Already a 256px square by the time it gets here. */
export async function saveAvatar(dataUrl: string): Promise<{ error?: string }> {
  const user = await requireUser();

  if (!/^data:image\/(jpeg|png|webp);base64,/.test(dataUrl)) {
    return { error: "That doesn't look like an image." };
  }
  // A 256px JPEG is ~20KB; anything past 500KB did not come from our resizer.
  if (dataUrl.length > 500_000) {
    return { error: "That image is too big. Try taking it again." };
  }

  await sql`update users set avatar = ${dataUrl} where id = ${user.id}`;
  revalidatePath("/", "layout");
  return {};
}

export async function removeAvatar() {
  const user = await requireUser();
  await sql`update users set avatar = null where id = ${user.id}`;
  revalidatePath("/", "layout");
}
