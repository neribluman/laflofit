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
 * Mifflin-St Jeor, the usual estimate. Needs weight, height, age and sex —
 * without all four there is no honest number to show, so it returns null
 * rather than guessing at the missing piece.
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
}): { bmr: number; maintenance: number } | null {
  if (!weightKg || !heightCm || !age || !sex || sex === "other") return null;

  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  const bmr = sex === "male" ? base + 5 : base - 161;
  const factor = ACTIVITY_FACTOR[activity ?? "light"] ?? 1.375;

  return { bmr: Math.round(bmr), maintenance: Math.round(bmr * factor) };
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
