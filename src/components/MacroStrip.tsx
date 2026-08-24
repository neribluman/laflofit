import type { Meal } from "@/lib/types";
import { macroTotals } from "@/lib/macros";

/**
 * Calories lead as a hero figure; the macros are stat tiles under it. No chart
 * — four numbers don't need one, and a ring here would compete with the day
 * score at the top of the page.
 */
export default function MacroStrip({
  meals,
  calorieTarget,
}: {
  meals: Meal[];
  calorieTarget?: number | null;
}) {
  if (meals.length === 0) return null;
  const totals = macroTotals(meals);
  const anyEstimated = meals.some((meal) => meal.estimated);

  const macros = [
    { label: "Protein", value: totals.protein },
    { label: "Carbs", value: totals.carbs },
    { label: "Fat", value: totals.fat },
    { label: "Fibre", value: totals.fibre },
  ].filter((macro) => macro.value > 0);

  return (
    <div className="card p-4">
      <div className="flex items-baseline gap-2">
        <span className="nums text-3xl font-bold leading-none">
          {totals.calories.toLocaleString()}
        </span>
        <span className="text-sm text-muted">kcal</span>
        {calorieTarget ? (
          <span className="nums ml-auto text-xs text-muted">
            of {calorieTarget.toLocaleString()}
            {totals.calories > calorieTarget && (
              <span className="text-warn">
                {" "}
                · {(totals.calories - calorieTarget).toLocaleString()} over
              </span>
            )}
          </span>
        ) : null}
      </div>

      {macros.length > 0 && (
        <dl className="mt-3 grid grid-cols-4 gap-2">
          {macros.map((macro) => (
            <div key={macro.label} className="rounded-lg bg-surface-2 px-2 py-2 text-center">
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                {macro.label}
              </dt>
              <dd className="nums mt-0.5 text-sm font-bold">{macro.value}g</dd>
            </div>
          ))}
        </dl>
      )}

      <p className="mt-2.5 text-xs text-muted">
        {meals.length} item{meals.length === 1 ? "" : "s"} logged
        {anyEstimated ? " · portions estimated, so treat these as ballpark" : ""}
      </p>
    </div>
  );
}
