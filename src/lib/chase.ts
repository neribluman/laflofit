import "server-only";
import {
  crewRoster,
  dayLogsBetween,
  entriesForLogs,
  rulesForPlans,
  workoutsBetween,
} from "./data";
import { addDays, lastNDays } from "./dates";
import { scoreDay, standingFor } from "./scoring";
import type { Chaser } from "@/components/LeaderChase";
import type { PlanRule } from "./types";

/**
 * Who, if anyone, should be floating across this person's screen.
 *
 * Returns null far more often than not, which is the point — every condition
 * here is a reason to leave someone alone:
 *
 * - They are the leader, or level with them. Taunting yourself is nonsense.
 * - Nobody has scored anything yet, so there is no lead to rub in.
 * - They already logged today. The nagging exists to get a day logged; once
 *   there is one, it has no business continuing.
 */
export async function leaderChase(
  crewId: string,
  meId: string,
  today: string,
): Promise<Chaser | null> {
  const roster = await crewRoster(crewId);
  if (roster.length < 2) return null;

  const ids = roster.map((member) => member.id);
  const week = lastNDays(today, 7);

  const [logs, workouts] = await Promise.all([
    dayLogsBetween(ids, addDays(today, -7), today),
    workoutsBetween(ids, today, today),
  ]);

  // Logging today is the way out, and a workout counts as logging.
  const loggedToday =
    logs.some((log) => log.user_id === meId && log.log_date === today) ||
    workouts.some((workout) => workout.user_id === meId);
  if (loggedToday) return null;

  const planIds = [
    ...new Set(
      [
        ...roster.map((member) => member.active_plan_id),
        ...logs.map((log) => log.plan_id),
      ].filter((value): value is string => Boolean(value)),
    ),
  ];
  const [allRules, entries] = await Promise.all([
    rulesForPlans(planIds),
    entriesForLogs(logs.map((log) => log.id)),
  ]);

  const rulesByPlan = new Map<string, PlanRule[]>();
  for (const rule of allRules) {
    rulesByPlan.set(rule.plan_id, [...(rulesByPlan.get(rule.plan_id) ?? []), rule]);
  }
  const entriesByLog = new Map<string, typeof entries>();
  for (const entry of entries) {
    entriesByLog.set(entry.day_log_id, [
      ...(entriesByLog.get(entry.day_log_id) ?? []),
      entry,
    ]);
  }

  const standings = roster.map((member) => {
    const scoreByDate = new Map(
      logs
        .filter((log) => log.user_id === member.id)
        .map((log) => [
          log.log_date,
          scoreDay(
            rulesByPlan.get(log.plan_id ?? member.active_plan_id ?? "") ?? [],
            entriesByLog.get(log.id) ?? [],
            true,
          ),
        ]),
    );
    return { member, standing: standingFor(week, scoreByDate, today) };
  });

  const mine = standings.find((row) => row.member.id === meId);
  const best = [...standings].sort((a, b) => b.standing.points - a.standing.points)[0];

  if (!mine || !best || best.member.id === meId) return null;
  if (best.standing.points <= 0) return null;
  if (best.standing.points <= mine.standing.points) return null;

  // Clean days, the same unit the Plan board uses, so the taunt and the
  // leaderboard can't tell different stories.
  const gap = (best.standing.points - mine.standing.points) / 100;
  const lead =
    gap >= 1
      ? `${gap.toFixed(1)} clean days ahead of you`
      : `ahead of you, and you haven't logged today`;

  return {
    id: best.member.id,
    name: best.member.display_name,
    emoji: best.member.emoji,
    hasAvatar: best.member.has_avatar,
    lead,
  };
}
