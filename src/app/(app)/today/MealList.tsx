import { deleteMeal } from "../actions";
import type { Meal } from "@/lib/types";

const SLOT_ORDER = ["breakfast", "lunch", "dinner", "snack", "drink"];

export default function MealList({ meals }: { meals: Meal[] }) {
  if (meals.length === 0) return null;

  const sorted = [...meals].sort(
    (a, b) =>
      SLOT_ORDER.indexOf(a.slot ?? "snack") - SLOT_ORDER.indexOf(b.slot ?? "snack"),
  );

  return (
    <ul className="card divide-y divide-line">
        {sorted.map((meal) => (
          <li key={meal.id} className="flex items-start gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm">{meal.description}</p>
              <p className="nums text-xs text-muted">
                {[
                  meal.slot,
                  meal.calories != null ? `${Math.round(meal.calories)} kcal` : null,
                  meal.protein_g != null ? `P ${Math.round(meal.protein_g)}` : null,
                  meal.carbs_g != null ? `C ${Math.round(meal.carbs_g)}` : null,
                  meal.fat_g != null ? `F ${Math.round(meal.fat_g)}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <form action={deleteMeal.bind(null, meal.id)}>
              <button
                className="btn-quiet px-1 py-1 text-xs"
                aria-label={`Delete ${meal.description}`}
              >
                Delete
              </button>
            </form>
          </li>
      ))}
    </ul>
  );
}
