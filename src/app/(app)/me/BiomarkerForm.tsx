import { saveMeasurement } from "../actions";
import SubmitButton from "@/components/SubmitButton";
import { lengthUnit, weightUnit } from "@/lib/units";
import type { Units } from "@/lib/types";

export default function BiomarkerForm({
  date,
  units,
  knowsHeight,
}: {
  date: string;
  units: Units;
  knowsHeight: boolean;
}) {
  const fields = [
    { name: "weight", label: `Weight (${weightUnit(units)})`, step: "0.1" },
    { name: "body_fat", label: "Body fat (%)", step: "0.1" },
    { name: "waist", label: `Waist (${lengthUnit(units)})`, step: "0.1" },
    { name: "resting_hr", label: "Resting HR (bpm)", step: "1" },
  ];

  return (
    <form action={saveMeasurement} className="card space-y-4 p-4">
      <div className="grid grid-cols-2 gap-3">
        {fields.map((field) => (
          <div key={field.name}>
            <label className="label" htmlFor={field.name}>
              {field.label}
            </label>
            <input
              id={field.name}
              name={field.name}
              type="number"
              inputMode="decimal"
              step={field.step}
              min={0}
              placeholder="—"
              className="field nums"
            />
          </div>
        ))}

        <div>
          <label className="label" htmlFor="measured_on">
            Date
          </label>
          <input
            id="measured_on"
            name="measured_on"
            type="date"
            defaultValue={date}
            max={date}
            required
            className="field nums"
          />
        </div>

        <div>
          <label className="label" htmlFor="height">
            Height ({lengthUnit(units)})
          </label>
          <input
            id="height"
            name="height"
            type="number"
            inputMode="decimal"
            step="0.1"
            min={0}
            placeholder={knowsHeight ? "—" : "once is enough"}
            className="field nums"
          />
        </div>
      </div>

      <SubmitButton pendingLabel="Saving…">Save entry</SubmitButton>
      <p className="text-xs text-muted">
        Fill in whatever you measured — blanks are left alone rather than wiped.
        One entry per day; saving again updates that day. Height is kept on your
        profile, so you only need it once.
      </p>
    </form>
  );
}
