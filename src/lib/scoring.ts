import type { PlanRule, RuleEntry } from "./types";
import { addDays } from "./dates";

/** Did this entry satisfy its rule? */
export function ruleSatisfied(
  rule: PlanRule,
  entry: RuleEntry | undefined,
): boolean {
  if (!entry) return false;
  if (rule.kind === "count") {
    if (entry.value == null || rule.target == null) return false;
    // A ceiling rule (calories) counts as met when you are AT or UNDER target;
    // everything else is a floor you have to reach.
    return isCeiling(rule) ? entry.value <= rule.target : entry.value >= rule.target;
  }
  return entry.checked === true;
}

/** Calories and similar are "stay under" targets rather than "get above". */
export function isCeiling(rule: PlanRule): boolean {
  const u = (rule.unit ?? "").toLowerCase();
  return u === "kcal" || u === "cal" || u === "calories";
}

export type DayScore = {
  earned: number;
  possible: number;
  ratio: number;
  perfect: boolean;
  logged: boolean;
};

export function scoreDay(
  rules: PlanRule[],
  entries: RuleEntry[],
  logged: boolean,
): DayScore {
  const daily = rules.filter((r) => r.cadence === "daily");
  const byRule = new Map(entries.map((e) => [e.rule_id, e]));
  let earned = 0;
  let possible = 0;
  for (const rule of daily) {
    possible += rule.points;
    if (ruleSatisfied(rule, byRule.get(rule.id))) earned += rule.points;
  }
  const ratio = possible === 0 ? 0 : earned / possible;
  return {
    earned,
    possible,
    ratio,
    perfect: logged && possible > 0 && earned === possible,
    logged,
  };
}

/**
 * Consecutive perfect days ending today. Today not being logged yet does not
 * break the streak — nobody should lose a 30-day run at 09:00.
 */
export function currentStreak(
  today: string,
  perfectByDate: Map<string, boolean>,
): number {
  let streak = 0;
  let cursor = today;
  if (!perfectByDate.get(cursor)) cursor = addDays(cursor, -1);
  while (perfectByDate.get(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function bestStreak(perfectDates: string[]): number {
  const sorted = [...perfectDates].sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}
