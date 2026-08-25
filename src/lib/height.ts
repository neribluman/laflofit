import { displayToCm, feetInchesToCm } from "./units";
import type { Units } from "./types";

/**
 * Height arrives as centimetres, or as feet + inches. Shared by every form
 * that can set it, so none of them has to know which shape the others use.
 *
 * Lives here rather than beside the actions because a "use server" module may
 * only export async functions.
 */
export function heightFromForm(
  formData: FormData,
  units: Units,
  metricValue: number | null,
): number | null {
  if (units !== "imperial") {
    return metricValue == null ? null : displayToCm(metricValue, units);
  }
  const feet = Number(String(formData.get("height_feet") ?? "").trim());
  const inches = Number(String(formData.get("height_inches") ?? "").trim());
  if (!Number.isFinite(feet) || feet <= 0) return null;
  return feetInchesToCm(feet, Number.isFinite(inches) ? inches : 0);
}
