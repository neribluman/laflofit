import type { Units, User } from "./types";
import { kgToDisplay, cmToDisplay, lengthUnit, weightUnit } from "./units";

export const ACTIVITY_LEVELS = [
  { value: "sedentary", label: "Desk job, little exercise" },
  { value: "light", label: "Light — a session or two a week" },
  { value: "moderate", label: "Moderate — 3 to 5 a week" },
  { value: "very", label: "Very active — most days" },
] as const;

const ACTIVITY_FACTOR: Record<string, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  very: 1.725,
};

export function ageFrom(birthYear: number | null, today: string): number | null {
  if (!birthYear) return null;
  const age = Number(today.slice(0, 4)) - birthYear;
  return age > 0 && age < 120 ? age : null;
}

/**
 * Which of the four inputs the energy estimate is still waiting on. Saying
 * "add age and height" when the missing thing is sex helps nobody.
 */
export function missingForEnergy(
  user: Pick<User, "height_cm" | "birth_year" | "sex">,
  weightKg: number | null,
  today: string,
): string[] {
  const missing: string[] = [];
  if (!weightKg) missing.push("a weigh-in");
  if (!user.height_cm) missing.push("your height");
  if (!ageFrom(user.birth_year, today)) missing.push("your age");
  if (!user.sex) missing.push("your sex");
  return missing;
}

/**
 * Mifflin-St Jeor, the usual estimate.
 *
 * The formula splits on sex by a flat 166 kcal. Someone who declined to say
 * gets the midpoint rather than being locked out of every calorie feature
 * forever — flagged approximate, because it is. Leaving it unanswered is
 * different from declining, and still asks.
 */
export function energyEstimate({
  weightKg,
  heightCm,
  age,
  sex,
  activity,
}: {
  weightKg: number | null;
  heightCm: number | null;
  age: number | null;
  sex: User["sex"];
  activity: User["activity_level"];
}): { bmr: number; maintenance: number; approximate: boolean } | null {
  if (!weightKg || !heightCm || !age || !sex) return null;

  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  const bmr =
    sex === "male" ? base + 5 : sex === "female" ? base - 161 : base - 78;
  const factor = ACTIVITY_FACTOR[activity ?? "light"] ?? 1.375;

  return {
    bmr: Math.round(bmr),
    maintenance: Math.round(bmr * factor),
    approximate: sex === "other",
  };
}

/**
 * One line of context for the model, built from whatever is known. Everything
 * is optional, so this shrinks gracefully rather than emitting "null".
 */
export function describePerson(
  user: User,
  latestWeightKg: number | null,
  today: string,
): string {
  const units: Units = user.units;
  const bits: string[] = [];

  const age = ageFrom(user.birth_year, today);
  if (age) bits.push(`${age} years old`);
  if (user.sex && user.sex !== "other") bits.push(user.sex);
  if (user.height_cm) {
    bits.push(`${cmToDisplay(user.height_cm, units).toFixed(0)} ${lengthUnit(units)} tall`);
  }
  if (latestWeightKg) {
    bits.push(`currently ${kgToDisplay(latestWeightKg, units).toFixed(1)} ${weightUnit(units)}`);
  }
  if (user.goal_weight_kg) {
    bits.push(`aiming for ${kgToDisplay(user.goal_weight_kg, units).toFixed(1)} ${weightUnit(units)}`);
  }
  const activity = ACTIVITY_LEVELS.find((a) => a.value === user.activity_level);
  if (activity) bits.push(activity.label.toLowerCase());

  const summary = bits.length > 0 ? bits.join(", ") : "";
  const notes = user.about?.trim();

  if (!summary && !notes) return "";
  return [summary, notes].filter(Boolean).join(". ");
}
