import { cmToFeetInches } from "@/lib/units";
import type { Units } from "@/lib/types";

/**
 * Height, asked the way the person thinks about it: centimetres, or feet and
 * inches as two fields. Posts `height` for metric and `height_feet` +
 * `height_inches` for imperial, which both save actions understand.
 */
export default function HeightField({
  units,
  currentCm,
  hint,
}: {
  units: Units;
  currentCm: number | null;
  hint?: string;
}) {
  if (units === "imperial") {
    const current = currentCm == null ? null : cmToFeetInches(currentCm);
    return (
      <div>
        <span className="label">Height</span>
        <div className="flex items-baseline gap-2">
          <input
            name="height_feet"
            type="number"
            inputMode="numeric"
            min={0}
            max={8}
            defaultValue={current?.feet ?? ""}
            placeholder={hint ? "" : "5"}
            aria-label="Height in feet"
            className="field nums w-full text-center"
          />
          <span className="text-xs text-muted">ft</span>
          <input
            name="height_inches"
            type="number"
            inputMode="numeric"
            min={0}
            max={11}
            defaultValue={current?.inches ?? ""}
            placeholder={hint ? "" : "11"}
            aria-label="Height in inches"
            className="field nums w-full text-center"
          />
          <span className="text-xs text-muted">in</span>
        </div>
      </div>
    );
  }

  return (
    <div>
      <label className="label" htmlFor="height">
        Height (cm)
      </label>
      <input
        id="height"
        name="height"
        type="number"
        inputMode="decimal"
        step="0.1"
        min={0}
        defaultValue={currentCm == null ? "" : currentCm.toFixed(1)}
        placeholder={hint ?? "—"}
        className="field nums"
      />
    </div>
  );
}
