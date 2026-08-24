import { cmToDisplay, kgToDisplay, lengthUnit, weightUnit } from "@/lib/units";
import type { Measurement, Units } from "@/lib/types";

function Tile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="card p-3.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
        {label}
      </p>
      <p className="nums mt-1 text-xl font-bold">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}

/** Latest reading of each biomarker — each taken from the most recent entry that has one. */
export default function BiomarkerGrid({
  measurements,
  units,
  heightCm,
}: {
  measurements: Measurement[];
  units: Units;
  heightCm: number | null;
}) {
  // Entries are oldest-first; the newest non-null wins for each marker.
  const latest = <K extends keyof Measurement>(key: K) => {
    for (let i = measurements.length - 1; i >= 0; i -= 1) {
      const value = measurements[i][key];
      if (value != null) return { value: value as number, on: measurements[i].measured_on };
    }
    return null;
  };

  const weight = latest("weight_kg");
  const bodyFat = latest("body_fat");
  const waist = latest("waist_cm");
  const hr = latest("resting_hr");

  const bmi =
    weight && heightCm && heightCm > 0
      ? weight.value / (heightCm / 100) ** 2
      : null;

  const tiles = [
    weight && {
      label: "Weight",
      value: `${kgToDisplay(weight.value, units).toFixed(1)} ${weightUnit(units)}`,
      sub: weight.on,
    },
    bmi && { label: "BMI", value: bmi.toFixed(1), sub: "from your height" },
    bodyFat && {
      label: "Body fat",
      value: `${bodyFat.value.toFixed(1)}%`,
      sub: bodyFat.on,
    },
    waist && {
      label: "Waist",
      value: `${cmToDisplay(waist.value, units).toFixed(1)} ${lengthUnit(units)}`,
      sub: waist.on,
    },
    hr && { label: "Resting HR", value: `${hr.value} bpm`, sub: hr.on },
    heightCm && {
      label: "Height",
      value: `${cmToDisplay(heightCm, units).toFixed(1)} ${lengthUnit(units)}`,
    },
  ].filter(Boolean) as { label: string; value: string; sub?: string }[];

  if (tiles.length === 0) {
    return (
      <p className="card p-4 text-sm text-muted">
        Nothing measured yet. Add your first entry below — weight and height are
        enough to get a BMI.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2.5">
      {tiles.map((tile) => (
        <Tile key={tile.label} {...tile} />
      ))}
    </div>
  );
}
