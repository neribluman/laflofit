"use client";

import { useActionState, useState, useTransition } from "react";
import {
  adoptPlan,
  choosePlan,
  draftPlan,
  createPlanFromDraft,
  type DraftResult,
  type FormState,
} from "./actions";
import SubmitButton from "@/components/SubmitButton";
import { PRESETS } from "@/lib/presets";
import type { Plan } from "@/lib/types";
import type { PlanDraft } from "@/lib/interpret";

const EXAMPLE =
  "I want to drop about 8kg by the summer without losing strength. Beer is my problem — I'll have four or five a week. I lift three times a week and want to keep that up.";

export default function PlanStep({
  crewName,
  existingPlans,
  canDraft,
}: {
  crewName: string;
  existingPlans: Plan[];
  canDraft: boolean;
}) {
  const [state, action] = useActionState<FormState, FormData>(choosePlan, {});
  const [picked, setPicked] = useState(PRESETS[0].key);
  const [own, setOwn] = useState(false);

  const [text, setText] = useState("");
  const [result, setResult] = useState<DraftResult | null>(null);
  const [drafting, startDrafting] = useTransition();
  const [creating, startCreating] = useTransition();
  const [shared, setShared] = useState(true);

  const build = () =>
    startDrafting(async () => setResult(await draftPlan(text)));

  const create = (draft: PlanDraft) =>
    startCreating(async () => {
      await createPlanFromDraft(draft, shared);
    });

  // ---- writing your own ----------------------------------------------------
  if (own) {
    if (result?.ok) {
      const draft = result.draft;
      return (
        <div className="card p-5">
          <p className="label">Here&apos;s the plan I&apos;d build</p>
          <h2 className="text-lg font-bold">{draft.name}</h2>
          {draft.description && (
            <p className="mt-0.5 text-sm text-muted">{draft.description}</p>
          )}

          <ul className="mt-4 space-y-2">
            {draft.rules.map((rule, i) => (
              <li key={i} className="rounded-xl bg-surface-2 p-3">
                <p className="text-sm font-medium">{rule.label}</p>
                <p className="nums text-xs text-muted">
                  {rule.kind === "count" && rule.target != null
                    ? `reach ${rule.target}${rule.unit ? ` ${rule.unit}` : ""}`
                    : rule.kind === "avoid"
                      ? "stay off it"
                      : "do it"}
                  {rule.cadence === "weekly" ? " · once a week" : ""}
                  {rule.points > 1 ? ` · ${rule.points} pts` : ""}
                </p>
              </li>
            ))}
          </ul>

          {draft.unclear.length > 0 && (
            <p className="mt-3 text-xs text-muted">
              Couldn&apos;t make a daily rule out of: {draft.unclear.join("; ")}.
            </p>
          )}

          <p className="label mt-5">Who follows it?</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { v: true, l: `Shared with ${crewName}` },
              { v: false, l: "Only I follow it" },
            ].map((option) => (
              <button
                key={String(option.v)}
                type="button"
                onClick={() => setShared(option.v)}
                className={`rounded-xl border px-2 py-2.5 text-center text-sm font-medium ${
                  shared === option.v
                    ? "border-accent bg-accent/15"
                    : "border-line bg-surface-2"
                }`}
              >
                <span className="truncate">{option.l}</span>
              </button>
            ))}
          </div>

          <div className="mt-5 flex gap-2">
            <button
              onClick={() => create(draft)}
              disabled={creating}
              className="btn-primary flex-1"
            >
              {creating ? "Setting up…" : "Use this plan"}
            </button>
            <button onClick={() => setResult(null)} className="btn-quiet px-3">
              Redo
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="card p-5">
        <label className="label" htmlFor="goal-text">
          What are you trying to do?
        </label>
        <textarea
          id="goal-text"
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          maxLength={1500}
          placeholder={EXAMPLE}
          className="field resize-none text-base leading-relaxed"
        />

        {drafting && (
          <div className="mt-3 space-y-2" aria-live="polite">
            <p className="text-sm text-muted">Working out your rules…</p>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-3 animate-pulse rounded bg-surface-2"
                style={{ width: `${[88, 70, 54][i]}%`, animationDelay: `${i * 140}ms` }}
              />
            ))}
          </div>
        )}

        <button
          onClick={build}
          disabled={drafting || text.trim().length < 8}
          className="btn-primary mt-3 w-full"
        >
          {drafting ? "Building…" : "Build my plan"}
        </button>
        <p className="mt-2 text-center text-xs text-muted">
          Goals, things you want to cut, how often you train. You&apos;ll see the
          rules before anything is saved.
        </p>

        {result && !result.ok && (
          <p className="mt-3 text-sm text-bad">{result.error}</p>
        )}

        <button onClick={() => setOwn(false)} className="btn-quiet mt-3 w-full text-xs">
          ← Back to the ready-made plans
        </button>
      </div>
    );
  }

  // ---- picking a ready-made one -------------------------------------------
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

        <div className="space-y-2">
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
                <span className="ml-auto text-xs text-muted">
                  {preset.rules.length} rules
                </span>
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

        <div className="mt-5">
          <SubmitButton pendingLabel="Setting up…">Start tracking</SubmitButton>
        </div>
        {state.error && <p className="mt-3 text-sm text-bad">{state.error}</p>}
      </form>

      {canDraft && (
        <button
          onClick={() => setOwn(true)}
          className="card w-full p-4 text-left hover:border-muted"
        >
          <span className="flex items-baseline gap-2">
            <span className="text-lg leading-none">✏️</span>
            <span className="font-semibold">None of these — write your own</span>
            <span className="ml-auto text-muted">→</span>
          </span>
          <span className="mt-1.5 block text-xs leading-relaxed text-muted">
            Say what you&apos;re trying to do in your own words and I&apos;ll turn
            it into a checklist, with targets sized to you.
          </span>
        </button>
      )}
    </div>
  );
}
