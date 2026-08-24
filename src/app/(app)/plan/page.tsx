import { redirect } from "next/navigation";
import { currentUser, planWithRules, plansForCrew } from "@/lib/data";
import { addRule, renamePlan, startPreset, switchPlan } from "./actions";
import RuleEditor from "./RuleEditor";
import SubmitButton from "@/components/SubmitButton";
import { PRESETS } from "@/lib/presets";

export default async function PlanPage() {
  const user = await currentUser();
  if (!user?.active_plan_id) redirect("/onboarding");

  const [planned, allPlans] = await Promise.all([
    planWithRules(user.active_plan_id),
    plansForCrew(user.crew_id),
  ]);
  if (!planned) redirect("/onboarding");

  const { plan, rules } = planned;
  const others = allPlans.filter((other) => other.id !== plan.id);
  const dailyPoints = rules
    .filter((r) => r.cadence === "daily")
    .reduce((sum, r) => sum + r.points, 0);

  return (
    <main className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Your plan</h1>
        <p className="mt-1 text-sm text-muted">
          {dailyPoints} points on offer every day.{" "}
          {plan.crew_id ? "Shared with your crew." : "Only you follow this one."}
        </p>
      </header>

      <form action={renamePlan} className="card flex gap-2 p-3">
        <input type="hidden" name="plan_id" value={plan.id} />
        <input
          name="name"
          defaultValue={plan.name}
          maxLength={60}
          className="field flex-1"
          aria-label="Plan name"
        />
        <SubmitButton className="btn-ghost">Rename</SubmitButton>
      </form>

      <section>
        <h2 className="label">Rules</h2>
        {rules.length === 0 ? (
          <p className="card p-4 text-sm text-muted">
            No rules yet. Add the first one below — start with the single habit
            that matters most.
          </p>
        ) : (
          <ul className="space-y-2">
            {rules.map((rule) => (
              <RuleEditor key={rule.id} rule={rule} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="label">Add a rule</h2>
        <form action={addRule} className="card space-y-3 p-4">
          <input type="hidden" name="plan_id" value={plan.id} />
          <input
            name="label"
            required
            maxLength={120}
            placeholder="e.g. No white carbs"
            className="field"
            aria-label="Rule"
          />
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { v: "do", l: "Do it" },
              { v: "avoid", l: "Avoid it" },
              { v: "count", l: "Count it" },
            ].map((k, i) => (
              <label
                key={k.v}
                className="cursor-pointer rounded-lg border border-line bg-surface-2 py-2 text-center text-xs font-medium
                           has-checked:border-accent has-checked:bg-accent/15"
              >
                <input
                  type="radio"
                  name="kind"
                  value={k.v}
                  defaultChecked={i === 0}
                  className="sr-only"
                />
                {k.l}
              </label>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <input
              name="target"
              type="number"
              step="any"
              placeholder="Target"
              className="field nums"
              aria-label="Target"
            />
            <input
              name="unit"
              maxLength={12}
              placeholder="Unit"
              className="field"
              aria-label="Unit"
            />
            <input
              name="points"
              type="number"
              min={0}
              max={5}
              defaultValue={1}
              className="field nums"
              aria-label="Points"
            />
          </div>
          <p className="text-xs text-muted">
            Target and unit only matter for &ldquo;count it&rdquo; rules — litres
            of water, grams of protein, calories. A unit of{" "}
            <span className="text-text">kcal</span> is treated as a ceiling to
            stay under; everything else is a floor to reach.
          </p>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              name="cadence"
              value="weekly"
              className="h-4 w-4 accent-[var(--accent)]"
            />
            Weekly allowance rather than a daily rule
          </label>
          <SubmitButton pendingLabel="Adding…">Add rule</SubmitButton>
        </form>
      </section>

      {others.length > 0 && (
        <section>
          <h2 className="label">Switch to another plan</h2>
          <div className="space-y-2">
            {others.map((other) => (
              <form key={other.id} action={switchPlan.bind(null, other.id)}>
                <button className="btn-ghost w-full justify-between">
                  <span className="truncate">{other.name}</span>
                  <span className="text-muted">Switch →</span>
                </button>
              </form>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="label">Start a different plan</h2>
        <div className="space-y-2">
          {PRESETS.filter((p) => p.key !== "blank").map((preset) => (
            <form key={preset.key} action={startPreset}>
              <input type="hidden" name="preset" value={preset.key} />
              <input type="hidden" name="scope" value="me" />
              <button className="btn-ghost w-full justify-between">
                <span className="truncate">
                  {preset.emoji} {preset.name}
                </span>
                <span className="text-muted">Start →</span>
              </button>
            </form>
          ))}
        </div>
      </section>
    </main>
  );
}
