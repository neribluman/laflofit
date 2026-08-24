import { sql, sqlOne } from "./db";
import { sessionUserId } from "./session";
import type {
  Comment,
  Exercise,
  Meal,
  Crew,
  DayLog,
  Measurement,
  Plan,
  PlanRule,
  Reaction,
  RuleEntry,
  User,
  Workout,
} from "./types";

// Postgres hands back `date` as a Date and `numeric` as a string, so every
// query below casts them to text / float8. Everything downstream can then
// assume plain YYYY-MM-DD strings and real numbers.

export async function currentUser(): Promise<User | null> {
  const id = await sessionUserId();
  if (!id) return null;
  return sqlOne<User>`
    select id, crew_id, display_name, emoji, units, timezone,
           height_cm::float8 as height_cm, birth_year, sex, activity_level,
           goal_weight_kg::float8 as goal_weight_kg, about, active_plan_id,
           created_at::text as created_at
    from users where id = ${id}
  `;
}

export async function crewById(id: string): Promise<Crew | null> {
  return sqlOne<Crew>`
    select id, name, invite_code, created_at::text as created_at
    from crews where id = ${id}
  `;
}

export async function crewByCode(code: string): Promise<Crew | null> {
  return sqlOne<Crew>`
    select id, name, invite_code, created_at::text as created_at
    from crews where invite_code = ${code.trim().toUpperCase()}
  `;
}

export async function crewRoster(crewId: string): Promise<User[]> {
  return sql<User>`
    select id, crew_id, display_name, emoji, units, timezone,
           height_cm::float8 as height_cm, birth_year, sex, activity_level,
           goal_weight_kg::float8 as goal_weight_kg, about, active_plan_id,
           created_at::text as created_at
    from users
    where crew_id = ${crewId}
    order by lower(display_name)
  `;
}

export async function planWithRules(
  planId: string,
): Promise<{ plan: Plan; rules: PlanRule[] } | null> {
  const plan = await sqlOne<Plan>`
    select id, crew_id, owner_id, name, description from plans where id = ${planId}
  `;
  if (!plan) return null;
  const rules = await rulesForPlans([planId]);
  return { plan, rules };
}

export async function rulesForPlans(planIds: string[]): Promise<PlanRule[]> {
  if (planIds.length === 0) return [];
  return sql<PlanRule>`
    select id, plan_id, label, kind, unit, target::float8 as target,
           cadence, points, sort_order
    from plan_rules
    where plan_id = any(${planIds}::uuid[])
    order by sort_order, label
  `;
}

/** Plans this crew can choose from: shared crew plans plus personal ones. */
export async function plansForCrew(crewId: string): Promise<Plan[]> {
  return sql<Plan>`
    select p.id, p.crew_id, p.owner_id, p.name, p.description
    from plans p
    left join users u on u.id = p.owner_id
    where p.crew_id = ${crewId} or u.crew_id = ${crewId}
    order by p.created_at
  `;
}

export async function dayLogsBetween(
  userIds: string[],
  from: string,
  to: string,
): Promise<DayLog[]> {
  if (userIds.length === 0) return [];
  return sql<DayLog>`
    select id, user_id, log_date::text as log_date, plan_id, note
    from day_logs
    where user_id = any(${userIds}::uuid[])
      and log_date between ${from}::date and ${to}::date
    order by log_date desc
  `;
}

export async function entriesForLogs(logIds: string[]): Promise<RuleEntry[]> {
  if (logIds.length === 0) return [];
  return sql<RuleEntry>`
    select day_log_id, rule_id, checked, value::float8 as value
    from rule_entries
    where day_log_id = any(${logIds}::uuid[])
  `;
}

export async function workoutsBetween(
  userIds: string[],
  from: string,
  to: string,
): Promise<Workout[]> {
  if (userIds.length === 0) return [];
  return sql<Workout>`
    select id, user_id, workout_date::text as workout_date, kind, minutes,
           intensity, notes
    from workouts
    where user_id = any(${userIds}::uuid[])
      and workout_date between ${from}::date and ${to}::date
    order by workout_date desc, created_at desc
  `;
}

export async function measurementsFor(userIds: string[]): Promise<Measurement[]> {
  if (userIds.length === 0) return [];
  return sql<Measurement>`
    select id, user_id, measured_on::text as measured_on,
           weight_kg::float8 as weight_kg, body_fat::float8 as body_fat,
           waist_cm::float8 as waist_cm, resting_hr, notes
    from measurements
    where user_id = any(${userIds}::uuid[])
    order by measured_on
  `;
}

export async function reactionsFor(targetIds: string[]): Promise<Reaction[]> {
  if (targetIds.length === 0) return [];
  return sql<Reaction>`
    select id, user_id, target_type, target_id, emoji
    from reactions where target_id = any(${targetIds}::uuid[])
  `;
}

export async function commentsFor(targetIds: string[]): Promise<Comment[]> {
  if (targetIds.length === 0) return [];
  return sql<Comment>`
    select id, user_id, target_type, target_id, body
    from comments
    where target_id = any(${targetIds}::uuid[])
    order by created_at
  `;
}

export async function mealsBetween(
  userIds: string[],
  from: string,
  to: string,
): Promise<Meal[]> {
  if (userIds.length === 0) return [];
  return sql<Meal>`
    select id, user_id, meal_date::text as meal_date, description, slot,
           calories::float8 as calories, protein_g::float8 as protein_g,
           carbs_g::float8 as carbs_g, fat_g::float8 as fat_g,
           fibre_g::float8 as fibre_g, estimated
    from meals
    where user_id = any(${userIds}::uuid[])
      and meal_date between ${from}::date and ${to}::date
    order by meal_date desc, created_at
  `;
}

export async function exercisesForWorkouts(
  workoutIds: string[],
): Promise<Exercise[]> {
  if (workoutIds.length === 0) return [];
  return sql<Exercise>`
    select id, workout_id, name, sets, reps,
           weight_kg::float8 as weight_kg, distance_km::float8 as distance_km,
           minutes, notes, sort_order
    from exercises
    where workout_id = any(${workoutIds}::uuid[])
    order by sort_order
  `;
}
