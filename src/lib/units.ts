import type { Units } from "./types";

const LB_PER_KG = 2.2046226218;
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

export function fmtWeight(kg: number | null, units: Units): string {
  if (kg == null) return "—";
  return `${kgToDisplay(kg, units).toFixed(1)} ${weightUnit(units)}`;
}
