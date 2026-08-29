import type { Units } from "./types";

const LB_PER_KG = 2.2046226218;
const MI_PER_KM = 0.621371192;
const IN_PER_CM = 0.3937007874;

export function kgToDisplay(kg: number, units: Units): number {
  return units === "imperial" ? kg * LB_PER_KG : kg;
}
export function displayToKg(v: number, units: Units): number {
  return units === "imperial" ? v / LB_PER_KG : v;
}
export function cmToDisplay(cm: number, units: Units): number {
  return units === "imperial" ? cm * IN_PER_CM : cm;
}
export function displayToCm(v: number, units: Units): number {
  return units === "imperial" ? v / IN_PER_CM : v;
}
export const weightUnit = (units: Units) =>
  units === "imperial" ? "lb" : "kg";
export const lengthUnit = (units: Units) =>
  units === "imperial" ? "in" : "cm";

/** The unit a number was written in, when we know it. */
export type StatedWeightUnit = "kg" | "lb" | null;
export type StatedDistanceUnit = "km" | "mi" | null;

/**
 * Convert to storage using the unit the person actually wrote, falling back to
 * their account setting only when they didn't say.
 *
 * Free text is where this matters: someone whose account is metric will still
 * write "155 lbs squat", and reading that as 155 kg turns a 70 kg lift into a
 * crew record.
 */
export function statedToKg(v: number, stated: StatedWeightUnit, units: Units): number {
  if (stated === "lb") return v / LB_PER_KG;
  if (stated === "kg") return v;
  return displayToKg(v, units);
}

export function statedToKm(v: number, stated: StatedDistanceUnit, units: Units): number {
  if (stated === "mi") return v / MI_PER_KM;
  if (stated === "km") return v;
  return displayToKm(v, units);
}

export function fmtWeight(kg: number | null, units: Units): string {
  if (kg == null) return "—";
  return `${kgToDisplay(kg, units).toFixed(1)} ${weightUnit(units)}`;
}

export function kmToDisplay(km: number, units: Units): number {
  return units === "imperial" ? km * MI_PER_KM : km;
}
export function displayToKm(v: number, units: Units): number {
  return units === "imperial" ? v / MI_PER_KM : v;
}
export const distanceUnit = (units: Units) => (units === "imperial" ? "mi" : "km");

const IN_PER_FOOT = 12;

/** Feet and inches from centimetres — 181cm is 5'11", not 71.3 inches. */
export function cmToFeetInches(cm: number): { feet: number; inches: number } {
  const totalInches = Math.round(cm * IN_PER_CM);
  return {
    feet: Math.floor(totalInches / IN_PER_FOOT),
    inches: totalInches % IN_PER_FOOT,
  };
}

export const feetInchesToCm = (feet: number, inches: number) =>
  (feet * IN_PER_FOOT + inches) / IN_PER_CM;

/** How a height should read back: "181 cm" or "5'11"". */
export function fmtHeight(cm: number | null, units: Units): string {
  if (cm == null) return "—";
  if (units === "metric") return `${cm.toFixed(0)} cm`;
  const { feet, inches } = cmToFeetInches(cm);
  return `${feet}'${inches}"`;
}
