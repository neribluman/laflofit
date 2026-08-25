import "server-only";
import {
  crewById,
  crewRoster,
  dayLogsBetween,
  entriesForLogs,
  mealsBetween,
  measurementsFor,
  rulesForPlans,
  workoutsBetween,
} from "./data";
import { addDays, lastNDays } from "./dates";
import { scoreDay, standingFor } from "./scoring";
import { calorieBoard, proteinBoard, strengthBoard } from "./boards";
import { exercisesForWorkouts } from "./data";
import type { PlanRule } from "./types";
import type { RoastMember } from "./roast";

/**
 * The week reduced to the handful of numbers a joke can be built on.
 *
 * Recomputed server-side rather than taken from the page, so what gets written
 * about someone is what the database says, not what a browser claimed.
 */
export async function roastInput(
  crewId: string,
  today: string,
): Promise<{ crewName: string; members: RoastMember[] } | null> {
  const crew = await crewById(crewId);
  if (!crew) return null;

  const roster = await crewRoster(crewId);
  if (roster.length === 0) return null;

  const ids = roster.map((member) => member.id);
  const week = lastNDays(today, 7);
  const monthAgo = addDays(today, -29);

  const [logs, workouts, measurements, meals] = await Promise.all([
    dayLogsBetween(ids, monthAgo, today),
    workoutsBetween(ids, monthAgo, today),
    measurementsFor(ids),
    mealsBetween(ids, week[0], today),
  ]);

  const exercises = await exercisesForWorkouts(workouts.map((w) => w.id));
  const workoutOwner = new Map(workouts.map((w) => [w.id, w.user_id]));

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

  const members = roster.map((member) => {
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
    const standing = standingFor(week, scoreByDate, today);

    const weightKg =
      [...measurements]
        .reverse()
        .find((m) => m.user_id === member.id && m.weight_kg != null)?.weight_kg ?? null;

    const theirMeals = meals.filter((meal) => meal.user_id === member.id);
    const theirWorkouts = workouts.filter(
      (workout) =>
        workout.user_id === member.id && week.includes(workout.workout_date),
    );
    const theirExercises = exercises.filter(
      (exercise) => workoutOwner.get(exercise.workout_id) === member.id,
    );

    const protein = proteinBoard(theirMeals, weightKg);
    const calories = calorieBoard(
      theirMeals,
      member,
      rulesByPlan.get(member.active_plan_id ?? "") ?? [],
      weightKg,
      today,
    );
    const strength = strengthBoard(theirExercises, weightKg);

    const theirWeights = measurements.filter(
      (m) => m.user_id === member.id && m.weight_kg != null && m.measured_on >= monthAgo,
    );

    return {
      name: member.display_name,
      isLeader: false,
      points: standing.points,
      daysLogged: standing.daysLogged,
      average: standing.average,
      streak: standing.streak,
      loggedToday: standing.loggedToday,
      daysTrained: new Set(theirWorkouts.map((w) => w.workout_date)).size,
      sessions: theirWorkouts.map(
        (w) => `${w.kind}${w.minutes ? ` ${w.minutes} min` : ""} (${w.intensity})`,
      ),
      proteinPerKg: protein.missing ? null : protein.value,
      calorieScore: calories.missing ? null : calories.value,
      strengthRatio: strength.missing ? null : strength.value,
      weightChangeKg:
        theirWeights.length < 2
          ? null
          : theirWeights[theirWeights.length - 1].weight_kg! -
            theirWeights[0].weight_kg!,
    };
  });

  const top = Math.max(...members.map((m) => m.points));

  // Leader first, then down to whoever is going to get it worst.
  members.sort((a, b) => b.points - a.points);

  return {
    crewName: crew.name,
    members: members.map((member) => ({
      ...member,
      isLeader: member.points === top && top > 0,
      points: undefined,
    })),
  };
}
