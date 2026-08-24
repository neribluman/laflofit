"use client";

import { useActionState, useState } from "react";
import { choosePlan, adoptPlan, type FormState } from "./actions";
import SubmitButton from "@/components/SubmitButton";
import { PRESETS } from "@/lib/presets";
import type { Plan } from "@/lib/types";

export default function PlanStep({
  crewName,
  existingPlans,
}: {
  crewName: string;
  existingPlans: Plan[];
}) {
  const [state, action] = useActionState<FormState, FormData>(choosePlan, {});
  const [picked, setPicked] = useState("slow-carb");

  return (
    <div className="space-y-4">
      {existingPlans.length > 0 && (
        <div className="card p-5">
          <h2 className="text-sm font-semibold">
            Plans already running in {crewName}
          </h2>
          <p className="mt-1 text-xs text-muted">
            Join one of these and you&apos;ll be scored on exactly the same rules
            as everyone else.
          </p>
          <div className="mt-3 space-y-2">
            {existingPlans.map((plan) => (
              <form key={plan.id} action={adoptPlan.bind(null, plan.id)}>
                <button className="btn-ghost w-full justify-between">
                  <span className="truncate">{plan.name}</span>
                  <span className="text-muted">Use this →</span>
                </button>
              </form>
            ))}
          </div>
        </div>
      )}

      <form action={action} className="card p-5">
        <input type="hidden" name="preset" value={picked} />

        <h2 className="text-sm font-semibold">Start a new plan</h2>
        <div className="mt-3 space-y-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.key}
              type="button"
              onClick={() => setPicked(preset.key)}
              aria-pressed={picked === preset.key}
              className={`w-full rounded-xl border p-3.5 text-left transition ${
                picked === preset.key
                  ? "border-accent bg-accent/10"
                  : "border-line bg-surface-2 hover:border-muted"
              }`}
            >
              <div className="flex items-baseline gap-2">
                <span className="text-lg leading-none">{preset.emoji}</span>
                <span className="font-semibold">{preset.name}</span>
                {preset.rules.length > 0 && (
                  <span className="ml-auto text-xs text-muted">
                    {preset.rules.length} rules
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">
                {preset.blurb}
              </p>
            </button>
          ))}
        </div>

        <p className="label mt-5">Who follows it?</p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { v: "crew", l: `Shared with ${crewName}` },
            { v: "me", l: "Only I follow it" },
          ].map((o) => (
            <label
              key={o.v}
              className="flex cursor-pointer items-center justify-center rounded-xl border border-line bg-surface-2 px-2 py-2.5 text-center text-sm font-medium
                         has-checked:border-accent has-checked:bg-accent/15"
            >
              <input
                type="radio"
                name="scope"
                value={o.v}
                defaultChecked={o.v === "crew"}
                className="sr-only"
              />
              <span className="truncate">{o.l}</span>
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">
          Either way your crew can see the rules, so your score means something.
        </p>

        <div className="mt-5">
          <SubmitButton pendingLabel="Setting up…">
            Start tracking
          </SubmitButton>
        </div>
        {state.error && <p className="mt-3 text-sm text-bad">{state.error}</p>}
      </form>
    </div>
  );
}
