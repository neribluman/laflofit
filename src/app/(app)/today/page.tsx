import Link from "next/link";
import { redirect } from "next/navigation";
import {
  currentUser,
  dayLogsBetween,
  entriesForLogs,
  exercisesForWorkouts,
  mealsBetween,
  measurementsFor,
  planWithRules,
  workoutsBetween,
} from "@/lib/data";
import {
  addDays,
  monthDays,
  monthLabel,
  prettyDate,
  startOfWeek,
  todayIn,
} from "@/lib/dates";
import { currentStreak, scoreDay } from "@/lib/scoring";
import { canInterpret } from "@/lib/interpret";
import { distanceUnit, fmtWeight, weightUnit } from "@/lib/units";
import ScoreRing from "@/components/ScoreRing";
import DayStrip, { type StripDay, type PeriodTotals } from "@/components/DayStrip";
import CheckInList from "./CheckInList";
import NaturalLog from "./NaturalLog";
import ResetDay from "./ResetDay";
import DateJump from "./DateJump";
import MacroStrip from "@/components/MacroStrip";
import MealList from "./MealList";
import WorkoutList from "./WorkoutList";
import AddFoodForm from "./AddFoodForm";
import AddWorkoutForm from "./AddWorkoutForm";
import DayNote from "./DayNote";

/**
 * Reading a day calls Claude, which took ~12s in testing. Server actions run
 * as part of the route they post to, and a platform default of 10s would cut
 * that off — so ask for longer explicitly.
 */
export const maxDuration = 60;

export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string; show?: string; m?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/login");

  const today = todayIn(user.timezone);
  const { d, show, m } = await searchParams;
  const date = d && /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= today ? d : today;

  const planned = user.active_plan_id
    ? await planWithRules(user.active_plan_id)
    : null;
  if (!planned) redirect("/onboarding");
  const { plan, rules } = planned;

  // The month being viewed, and a window wide enough for it plus the streak.
  const month =
    m && /^\d{4}-\d{2}$/.test(m) && `${m}-01` <= today ? m : date.slice(0, 7);
  const monthStart = `${month}-01`;
  const windowStart =
    monthStart < addDays(today, -59) ? monthStart : addDays(today, -59);
  const logs = await dayLogsBetween([user.id], windowStart, today);
  const entries = await entriesForLogs(logs.map((l) => l.id));

  const entriesByLog = new Map<string, typeof entries>();
  for (const entry of entries) {
    const list = entriesByLog.get(entry.day_log_id) ?? [];
    list.push(entry);
    entriesByLog.set(entry.day_log_id, list);
  }

  const scoreByDate = new Map(
    logs.map((log) => [
      log.log_date,
      scoreDay(rules, entriesByLog.get(log.id) ?? [], true),
    ]),
  );

  const [meals, workouts, weighIns] = await Promise.all([
    mealsBetween([user.id], date, date),
    workoutsBetween([user.id], date, date),
    measurementsFor([user.id]),
  ]);
  const exercises = await exercisesForWorkouts(workouts.map((w) => w.id));
  const todayWeight = weighIns.find((m) => m.measured_on === date);
  // If the plan has a calorie ceiling, show progress against it.
  const calorieRule = rules.find(
    (rule) =>
      rule.kind === "count" &&
      (["kcal", "cal", "calories"].includes((rule.unit ?? "").toLowerCase()) ||
        rule.label.toLowerCase().includes("calorie")),
  );

  const todayLog = logs.find((l) => l.log_date === date);
  const todayEntries = todayLog ? (entriesByLog.get(todayLog.id) ?? []) : [];
  const score = scoreDay(rules, todayEntries, true);

  const streak = currentStreak(
    today,
    new Map([...scoreByDate].map(([k, v]) => [k, v.perfect])),
  );

  const monthGrid: StripDay[] = monthDays(month).map((day) => {
    const score = scoreByDate.get(day);
    return {
      date: day,
      ratio: score?.ratio ?? 0,
      perfect: score?.perfect ?? false,
      logged: Boolean(score),
    };
  });

  const loggedDays = monthGrid.filter((day) => day.logged);
  const monthMeals = await mealsBetween(
    [user.id],
    monthStart,
    monthDays(month).at(-1)!,
  );

  // Averages count only the days that have the thing being averaged — a month
  // with two weigh-ins should not report an average calorie intake of zero.
  const daysWithFood = new Map<string, { kcal: number; protein: number }>();
  for (const meal of monthMeals) {
    const running = daysWithFood.get(meal.meal_date) ?? { kcal: 0, protein: 0 };
    running.kcal += meal.calories ?? 0;
    running.protein += meal.protein_g ?? 0;
    daysWithFood.set(meal.meal_date, running);
  }
  const foodDays = [...daysWithFood.values()];
  const mean = (nums: number[]) =>
    nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : null;

  const monthTotals: PeriodTotals = {
    daysLogged: loggedDays.length,
    averageScore: mean(loggedDays.map((day) => day.ratio * 100)) ?? 0,
    averageCalories: mean(foodDays.map((f) => f.kcal)),
    averageProtein: mean(foodDays.map((f) => f.protein)),
  };

  // Weekly allowances (the slow-carb cheat day) reset every Monday.
  const weekStart = startOfWeek(date);
  const weeklyUsed = new Map<string, string>();
  for (const rule of rules.filter((r) => r.cadence === "weekly")) {
    for (const log of logs) {
      if (log.log_date < weekStart || log.log_date > addDays(weekStart, 6))
        continue;
      const hit = (entriesByLog.get(log.id) ?? []).find(
        (e) => e.rule_id === rule.id && e.checked,
      );
      if (hit) {
        weeklyUsed.set(rule.id, log.log_date);
        break;
      }
    }
  }

  // An untouched day shows nothing but the box. Everything else appears once
  // there is something to show — or when someone asks for it explicitly,
  // because typing shouldn't be the only way in.
  //
  // A weigh-in deliberately does not count. Mentioning your weight at sign-up
  // records one for today, and that is not the same as having logged your day
  // — counting it meant everybody's first day opened fully expanded.
  const hasContent =
    meals.length > 0 ||
    workouts.length > 0 ||
    Boolean(todayLog?.note) ||
    todayEntries.some((e) => e.checked != null || e.value != null);
  const showAll = hasContent || show === "all" || !canInterpret();

  const prev = addDays(date, -1);
  const next = addDays(date, 1);

  return (
    <main className="space-y-6">
      <header className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          {/* The page is the log; the date says which day of it you're on. */}
          <h1 className="text-2xl font-bold tracking-tight">Log</h1>
          <div className="mt-0.5 flex items-center gap-1">
            <Link
              href={`/today?d=${prev}`}
              aria-label="Previous day"
              className="btn-quiet -ml-2 px-2 py-1"
            >
              ‹
            </Link>
            <DateJump date={date} today={today} label={prettyDate(date, today)} />
            {next <= today && (
              <Link
                href={`/today?d=${next}`}
                aria-label="Next day"
                className="btn-quiet px-2 py-1"
              >
                ›
              </Link>
            )}
          </div>
          <p className="mt-1 truncate text-sm text-muted">{plan.name}</p>
          {streak > 0 && (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent">
              🔥 {streak} perfect day{streak === 1 ? "" : "s"} running
            </p>
          )}
        </div>
        {showAll && (
          <ScoreRing
            ratio={score.ratio}
            label={`${score.earned}/${score.possible} pts`}
          />
        )}
      </header>

      <div className="lg:max-w-xl">
        <DayStrip
          days={monthGrid}
          selected={date}
          today={today}
          totals={monthTotals}
          totalsLabel={monthLabel(month)}
        />
      </div>

      <div
        className={
          showAll
            ? "grid gap-6 lg:grid-cols-2 lg:items-start"
            : "mx-auto w-full max-w-xl"
        }
      >
        <div className="space-y-6">
          {canInterpret() && (
            <NaturalLog
              key={`log-${date}`}
              date={date}
              weightUnit={weightUnit(user.units)}
              distanceUnit={distanceUnit(user.units)}
              prominent={!showAll}
              fallbackHref={showAll ? undefined : `/today?d=${date}&show=all`}
            />
          )}

          {/* These two hold local state seeded from the day's row, so the key
          carries that row's id: resetting the day deletes the row, the id
          changes, and both remount clean instead of showing stale ticks. */}
          {showAll && (
            <>
              {rules.length === 0 ? (
                <div className="card p-6 text-center">
                  <p className="text-sm text-muted">
                    This plan has no rules yet — nothing to tick off.
                  </p>
                  <Link href="/plan" className="btn-primary mt-4">
                    Add your rules
                  </Link>
                </div>
              ) : (
                <CheckInList
                  key={`checks-${date}-${todayLog?.id ?? "empty"}`}
                  date={date}
                  rules={rules}
                  entries={todayEntries}
                />
              )}
            </>
          )}
        </div>

        {showAll && (
          <div className="space-y-6">
            <section className="space-y-2.5">
              <h2 className="label mb-0">Food</h2>
              {meals.length > 0 ? (
                <>
                  <MacroStrip
                    meals={meals}
                    calorieTarget={calorieRule?.target ?? null}
                  />
                  <MealList meals={meals} />
                </>
              ) : (
                <p className="card p-4 text-sm text-muted">
                  Nothing yet. Describe what you ate in the box, or add it by
                  hand.
                </p>
              )}
              <AddFoodForm date={date} />
            </section>

            <section className="space-y-2.5">
              <h2 className="label mb-0">Training</h2>
              {workouts.length > 0 ? (
                <WorkoutList
                  workouts={workouts}
                  exercises={exercises}
                  units={user.units}
                  weightUnit={weightUnit(user.units)}
                  distanceUnit={distanceUnit(user.units)}
                />
              ) : (
                <p className="card p-4 text-sm text-muted">
                  Nothing yet. Describe the session in the box &mdash;
                  &ldquo;squats 5x5 at 100kg&rdquo; and the like &mdash; or add
                  it by hand.
                </p>
              )}
              <AddWorkoutForm date={date} />
            </section>

            {todayWeight?.weight_kg != null && (
              <p className="text-sm text-muted">
                Weighed in at{" "}
                <span className="nums font-semibold text-text">
                  {fmtWeight(todayWeight.weight_kg, user.units)}
                </span>
                .
              </p>
            )}

            {weeklyUsed.size > 0 && (
              <ul className="space-y-1">
                {[...weeklyUsed].map(([ruleId, usedOn]) => (
                  <li key={ruleId} className="text-xs text-muted">
                    {rules.find((r) => r.id === ruleId)?.label} used this week
                    on {prettyDate(usedOn, today)}.
                  </li>
                ))}
              </ul>
            )}

            <DayNote
              key={`note-${date}-${todayLog?.id ?? "empty"}`}
              date={date}
              initial={todayLog?.note ?? ""}
            />

            <Link href="/me" className="btn-ghost w-full">
              Your data and history →
            </Link>

            <ResetDay date={date} label={prettyDate(date, today)} />
          </div>
        )}
      </div>
    </main>
  );
}
