import { addWorkout } from "../actions";
import SubmitButton from "@/components/SubmitButton";
import { WORKOUT_KINDS } from "@/lib/presets";

export default function AddWorkoutForm({ date }: { date: string }) {
  return (
    <details className="card p-4">
      <summary className="cursor-pointer text-sm font-medium text-muted">
        Add a workout by hand
      </summary>
      <form action={addWorkout} className="mt-4 space-y-3">
        <input type="hidden" name="workout_date" value={date} />
        <div className="grid grid-cols-4 gap-1.5">
          {WORKOUT_KINDS.map((kind, i) => (
            <label
              key={kind}
              className="cursor-pointer rounded-lg border border-line bg-surface-2 py-2 text-center text-xs font-medium
                         has-checked:border-accent has-checked:bg-accent/15"
            >
              <input
                type="radio"
                name="kind"
                value={kind}
                defaultChecked={i === 0}
                className="sr-only"
              />
              {kind}
            </label>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input
            name="minutes"
            type="number"
            inputMode="numeric"
            min={0}
            max={600}
            placeholder="Minutes"
            aria-label="Minutes"
            className="field nums"
          />
          <select name="intensity" aria-label="How hard?" className="field" defaultValue="moderate">
            <option value="easy">Easy</option>
            <option value="moderate">Moderate</option>
            <option value="hard">Hard</option>
          </select>
        </div>
        <input
          name="notes"
          maxLength={300}
          placeholder="Notes (optional)"
          aria-label="Notes"
          className="field"
        />
        <SubmitButton pendingLabel="Adding…">Add workout</SubmitButton>
      </form>
    </details>
  );
}
