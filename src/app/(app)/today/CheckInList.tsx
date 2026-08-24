"use client";

import { useState, useTransition } from "react";
import { setRuleChecked, setRuleValue } from "../actions";
import { isCeiling, ruleSatisfied } from "@/lib/scoring";
import type { PlanRule, RuleEntry } from "@/lib/types";

type Draft = Record<string, { checked: boolean | null; value: number | null }>;

export default function CheckInList({
  date,
  rules,
  entries,
}: {
  date: string;
  rules: PlanRule[];
  entries: RuleEntry[];
}) {
  const [draft, setDraft] = useState<Draft>(() =>
    Object.fromEntries(
      entries.map((e) => [e.rule_id, { checked: e.checked, value: e.value }]),
    ),
  );
  const [, startTransition] = useTransition();

  const asEntry = (ruleId: string): RuleEntry | undefined => {
    const d = draft[ruleId];
    return d ? { day_log_id: "", rule_id: ruleId, ...d } : undefined;
  };

  const push = (
    ruleId: string,
    patch: { checked?: boolean | null; value?: number | null },
  ) => {
    setDraft((prev) => ({
      ...prev,
      [ruleId]: {
        checked: prev[ruleId]?.checked ?? null,
        value: prev[ruleId]?.value ?? null,
        ...patch,
      },
    }));
    startTransition(async () => {
      if (patch.checked !== undefined) {
        await setRuleChecked(date, ruleId, patch.checked ?? false);
      } else {
        await setRuleValue(date, ruleId, patch.value ?? null);
      }
    });
  };

  const daily = rules.filter((r) => r.cadence === "daily");
  const weekly = rules.filter((r) => r.cadence === "weekly");

  return (
    <div className="space-y-5">
      <ul className="space-y-2">
        {daily.map((rule) => (
          <RuleRow
            key={rule.id}
            rule={rule}
            entry={asEntry(rule.id)}
            onCheck={(v) => push(rule.id, { checked: v })}
            onValue={(v) => push(rule.id, { value: v })}
          />
        ))}
      </ul>

      {weekly.length > 0 && (
        <div>
          <p className="label">Once a week</p>
          <ul className="space-y-2">
            {weekly.map((rule) => (
              <RuleRow
                key={rule.id}
                rule={rule}
                entry={asEntry(rule.id)}
                onCheck={(v) => push(rule.id, { checked: v })}
                onValue={(v) => push(rule.id, { value: v })}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function RuleRow({
  rule,
  entry,
  onCheck,
  onValue,
}: {
  rule: PlanRule;
  entry: RuleEntry | undefined;
  onCheck: (v: boolean) => void;
  onValue: (v: number | null) => void;
}) {
  const met = ruleSatisfied(rule, entry);

  if (rule.kind === "count") {
    return (
      <li
        className={`card flex items-center gap-3 p-3.5 transition ${
          met ? "border-accent/50" : ""
        }`}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{rule.label}</p>
          <p className="text-xs text-muted">
            {isCeiling(rule) ? "Stay under" : "Reach"} {rule.target}
            {rule.unit ? ` ${rule.unit}` : ""}
          </p>
        </div>
        <input
          type="number"
          inputMode="decimal"
          step="any"
          defaultValue={entry?.value ?? ""}
          onBlur={(e) => {
            const raw = e.target.value.trim();
            onValue(raw === "" ? null : Number(raw));
          }}
          aria-label={rule.label}
          className={`field w-24 text-center nums ${met ? "border-accent" : ""}`}
          placeholder="—"
        />
      </li>
    );
  }

  return (
    <li>
      <button
        type="button"
        onClick={() => onCheck(!(entry?.checked ?? false))}
        aria-pressed={met}
        className={`card flex w-full items-center gap-3 p-3.5 text-left transition active:scale-[.99] ${
          met ? "border-accent/50 bg-accent/5" : "hover:border-muted"
        }`}
      >
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 text-xs font-bold transition ${
            met
              ? "border-accent bg-accent text-accent-ink"
              : "border-line text-transparent"
          }`}
        >
          ✓
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{rule.label}</span>
          {rule.kind === "avoid" && (
            <span className="block text-xs text-muted">
              Tick it if you stayed off it
            </span>
          )}
        </span>
        {rule.points > 1 && <span className="chip nums">{rule.points} pts</span>}
      </button>
    </li>
  );
}
