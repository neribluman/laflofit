import { addMeal } from "../actions";
import SubmitButton from "@/components/SubmitButton";

const SLOTS = ["breakfast", "lunch", "dinner", "snack", "drink"] as const;

export default function AddFoodForm({ date }: { date: string }) {
  return (
    <details className="card p-4">
      <summary className="cursor-pointer text-sm font-medium text-muted">
        Add food by hand
      </summary>
      <form action={addMeal} className="mt-4 space-y-3">
        <input type="hidden" name="meal_date" value={date} />
        <input
          name="description"
          required
          maxLength={200}
          placeholder="What was it?"
          aria-label="What was it?"
          className="field"
        />
        <div className="grid grid-cols-5 gap-1.5">
          {SLOTS.map((slot, i) => (
            <label
              key={slot}
              className="cursor-pointer rounded-lg border border-line bg-surface-2 py-2 text-center text-[11px] font-medium capitalize
                         has-checked:border-accent has-checked:bg-accent/15"
            >
              <input
                type="radio"
                name="slot"
                value={slot}
                defaultChecked={i === 0}
                className="sr-only"
              />
              {slot}
            </label>
          ))}
        </div>
        <div className="grid grid-cols-5 gap-1.5">
          {[
            { name: "calories", label: "kcal" },
            { name: "protein_g", label: "P" },
            { name: "carbs_g", label: "C" },
            { name: "fat_g", label: "F" },
            { name: "fibre_g", label: "Fib" },
          ].map((field) => (
            <div key={field.name}>
              <label
                className="mb-1 block text-center text-[10px] font-semibold uppercase text-muted"
                htmlFor={`meal-${field.name}`}
              >
                {field.label}
              </label>
              <input
                id={`meal-${field.name}`}
                name={field.name}
                type="number"
                inputMode="numeric"
                min={0}
                placeholder="—"
                className="field nums px-1 text-center"
              />
            </div>
          ))}
        </div>
        <SubmitButton pendingLabel="Adding…">Add food</SubmitButton>
      </form>
    </details>
  );
}
