import Link from "next/link";
import { cmToDisplay, fmtHeight, kgToDisplay, lengthUnit, weightUnit } from "@/lib/units";
import { ageFrom, energyEstimate, missingForEnergy } from "@/lib/profile";
import type { Measurement, User } from "@/lib/types";

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
  user,
  today,
}: {
  measurements: Measurement[];
  user: User;
  today: string;
}) {
  const units = user.units;
  const heightCm = user.height_cm;
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

  const age = ageFrom(user.birth_year, today);
  const energy = energyEstimate({
    weightKg: weight?.value ?? null,
    heightCm,
    age,
    sex: user.sex,
    activity: user.activity_level,
  });
  const blocking = missingForEnergy(user, weight?.value ?? null, today);

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
    heightCm && { label: "Height", value: fmtHeight(heightCm, units) },
    user.goal_weight_kg && {
      label: "Goal",
      value: `${kgToDisplay(user.goal_weight_kg, units).toFixed(1)} ${weightUnit(units)}`,
      sub:
        weight
          ? `${Math.abs(kgToDisplay(weight.value - user.goal_weight_kg, units)).toFixed(1)} to go`
          : undefined,
    },
    age && { label: "Age", value: String(age) },
    energy && {
      label: "Maintenance",
      value: `${energy.maintenance.toLocaleString()} kcal`,
      sub: energy.approximate
        ? "rough — sex not given"
        : `at rest ${energy.bmr.toLocaleString()}`,
    },
  ].filter(Boolean) as { label: string; value: string; sub?: string }[];

  if (tiles.length === 0) {
    return (
      <p className="card p-4 text-sm text-muted">
        Nothing measured yet. Add your first entry below — weight and height
        are enough for a BMI, and adding your age and sex gets you a
        maintenance-calorie estimate too.
      </p>
    );
  }

  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-2 gap-2.5">
        {tiles.map((tile) => (
          <Tile key={tile.label} {...tile} />
        ))}
      </div>

      {!energy && blocking.length > 0 && (
        <p className="card p-3.5 text-xs text-muted">
          Add {blocking.join(" and ")} under{" "}
          <Link href="#about-you" className="font-semibold text-accent">
            About you
          </Link>{" "}
          and you&apos;ll get a maintenance-calorie estimate, and a place on the
          crew&apos;s calorie board.
        </p>
      )}
    </div>
  );
}
