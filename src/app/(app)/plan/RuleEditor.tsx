"use client";

import { useState } from "react";
import { deleteRule, updateRule } from "./actions";
import SubmitButton from "@/components/SubmitButton";
import type { PlanRule } from "@/lib/types";

const KINDS = [
  { v: "do", l: "Do it" },
  { v: "avoid", l: "Avoid it" },
  { v: "count", l: "Count it" },
];

export default function RuleEditor({ rule }: { rule: PlanRule }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <li className="card flex items-center gap-3 p-3.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{rule.label}</p>
          <p className="text-xs text-muted">
            {KINDS.find((k) => k.v === rule.kind)?.l}
            {rule.kind === "count" && rule.target != null
              ? ` · ${rule.target}${rule.unit ? ` ${rule.unit}` : ""}`
              : ""}
            {rule.cadence === "weekly" ? " · weekly" : ""}
            {` · ${rule.points} pt${rule.points === 1 ? "" : "s"}`}
          </p>
        </div>
        <button onClick={() => setOpen(true)} className="btn-quiet px-2 py-1 text-xs">
          Edit
        </button>
      </li>
    );
  }

  return (
    <li className="card p-3.5">
      <form action={updateRule} className="space-y-3">
        <input type="hidden" name="id" value={rule.id} />
        <input
          name="label"
          defaultValue={rule.label}
          maxLength={120}
          required
          className="field"
        />
        <div className="grid grid-cols-3 gap-1.5">
          {KINDS.map((k) => (
            <label
              key={k.v}
              className="cursor-pointer rounded-lg border border-line bg-surface-2 py-2 text-center text-xs font-medium
                         has-checked:border-accent has-checked:bg-accent/15"
            >
              <input
                type="radio"
                name="kind"
                value={k.v}
                defaultChecked={rule.kind === k.v}
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
            defaultValue={rule.target ?? ""}
            placeholder="Target"
            className="field nums"
          />
          <input
            name="unit"
            defaultValue={rule.unit ?? ""}
            placeholder="Unit"
            maxLength={12}
            className="field"
          />
          <input
            name="points"
            type="number"
            min={0}
            max={5}
            defaultValue={rule.points}
            placeholder="Points"
            className="field nums"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            name="cadence"
            value="weekly"
            defaultChecked={rule.cadence === "weekly"}
            className="h-4 w-4 accent-[var(--accent)]"
          />
          Weekly allowance rather than a daily rule
        </label>
        <div className="flex gap-2">
          <SubmitButton className="btn-primary flex-1">Save</SubmitButton>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="btn-ghost"
          >
            Cancel
          </button>
        </div>
      </form>
      <form action={deleteRule.bind(null, rule.id)} className="mt-2">
        <button className="btn-quiet w-full text-xs text-bad">Delete this rule</button>
      </form>
    </li>
  );
}
