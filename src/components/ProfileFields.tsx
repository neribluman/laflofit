import { saveProfileFields } from "@/app/(app)/profile-actions";
import SubmitButton from "@/components/SubmitButton";
import { ACTIVITY_LEVELS, ageFrom } from "@/lib/profile";
import { cmToDisplay, kgToDisplay, weightUnit } from "@/lib/units";
import type { User } from "@/lib/types";

/** The by-hand version. Every field optional. */
export default function ProfileFields({
  user,
  today,
  submitLabel = "Save",
}: {
  user: User;
  today: string;
  submitLabel?: string;
}) {
  const units = user.units;
  const age = ageFrom(user.birth_year, today);

  return (
    <form action={saveProfileFields} className="card space-y-4 p-4">
      <input type="hidden" name="this_year" value={today.slice(0, 4)} />

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="label" htmlFor="age">
            Age
          </label>
          <input
            id="age"
            name="age"
            type="number"
            inputMode="numeric"
            min={10}
            max={110}
            defaultValue={age ?? ""}
            placeholder="—"
            className="field nums"
          />
        </div>
        <div>
          <label className="label" htmlFor="height">
            Height ({units === "imperial" ? "in" : "cm"})
          </label>
          <input
            id="height"
            name="height"
            type="number"
            inputMode="decimal"
            step="0.1"
            defaultValue={
              user.height_cm == null ? "" : cmToDisplay(user.height_cm, units).toFixed(1)
            }
            placeholder="—"
            className="field nums"
          />
        </div>
        <div>
          <label className="label" htmlFor="goal_weight">
            Goal ({weightUnit(units)})
          </label>
          <input
            id="goal_weight"
            name="goal_weight"
            type="number"
            inputMode="decimal"
            step="0.1"
            defaultValue={
              user.goal_weight_kg == null
                ? ""
                : kgToDisplay(user.goal_weight_kg, units).toFixed(1)
            }
            placeholder="—"
            className="field nums"
          />
        </div>
      </div>

      <div>
        <p className="label">Sex</p>
        <div className="grid grid-cols-3 gap-1.5">
          {[
            { v: "male", l: "Male" },
            { v: "female", l: "Female" },
            { v: "other", l: "Rather not" },
          ].map((option) => (
            <label
              key={option.v}
              className="cursor-pointer rounded-lg border border-line bg-surface-2 py-2 text-center text-xs font-medium
                         has-checked:border-accent has-checked:bg-accent/15"
            >
              <input
                type="radio"
                name="sex"
                value={option.v}
                defaultChecked={user.sex === option.v}
                className="sr-only"
              />
              {option.l}
            </label>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-muted">
          Only used for the calorie maths, which needs it to mean anything. Not
          shown to your crew.
        </p>
      </div>

      <div>
        <label className="label" htmlFor="activity_level">
          Normal week
        </label>
        <select
          id="activity_level"
          name="activity_level"
          defaultValue={user.activity_level ?? ""}
          className="field"
        >
          <option value="">—</option>
          {ACTIVITY_LEVELS.map((level) => (
            <option key={level.value} value={level.value}>
              {level.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="label" htmlFor="about">
          Anything else worth knowing
        </label>
        <textarea
          id="about"
          name="about"
          rows={3}
          maxLength={600}
          defaultValue={user.about ?? ""}
          placeholder="What you're training for, injuries to work around, food you don't eat…"
          className="field resize-none"
        />
      </div>

      <SubmitButton>{submitLabel}</SubmitButton>
    </form>
  );
}
