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
  lastNDays,
  prettyDate,
  startOfWeek,
  todayIn,
} from "@/lib/dates";
import { currentStreak, scoreDay } from "@/lib/scoring";
import { canInterpret } from "@/lib/interpret";
import { distanceUnit, fmtWeight, weightUnit } from "@/lib/units";
import ScoreRing from "@/components/ScoreRing";
import WeekStrip, { type StripDay } from "@/components/WeekStrip";
import CheckInList from "./CheckInList";
import NaturalLog from "./NaturalLog";
import ResetDay from "./ResetDay";
import MacroStrip from "@/components/MacroStrip";
import MealList from "./MealList";
import WorkoutList from "./WorkoutList";
import AddFoodForm from "./AddFoodForm";
import AddWorkoutForm from "./AddWorkoutForm";
import DayNote from "./DayNote";

export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/login");

  const today = todayIn(user.timezone);
  const { d } = await searchParams;
  const date = d && /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= today ? d : today;

  const planned = user.active_plan_id
    ? await planWithRules(user.active_plan_id)
    : null;
  if (!planned) redirect("/onboarding");
  const { plan, rules } = planned;

  // 60 days is enough history for the streak and the week strip in one query.
  const windowStart = addDays(today, -59);
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

  const strip: StripDay[] = lastNDays(date, 7).map((day) => {
    const s = scoreByDate.get(day);
    return {
      date: day,
      ratio: s?.ratio ?? 0,
      perfect: s?.perfect ?? false,
      logged: Boolean(s),
    };
  });

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

  const prev = addDays(date, -1);
  const next = addDays(date, 1);

  return (
    <main className="space-y-6">
      <header className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <Link
              href={`/today?d=${prev}`}
              aria-label="Previous day"
              className="btn-quiet -ml-2 px-2 py-1"
            >
              ‹
            </Link>
            <h1 className="truncate text-2xl font-bold tracking-tight">
              {prettyDate(date, today)}
            </h1>
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
        <ScoreRing
          ratio={score.ratio}
          label={`${score.earned}/${score.possible} pts`}
        />
      </header>

      <div className="lg:max-w-xl">
        <WeekStrip days={strip} selected={date} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <div className="space-y-6">
          {canInterpret() && (
            <NaturalLog
              key={`log-${date}`}
              date={date}
              weightUnit={weightUnit(user.units)}
              distanceUnit={distanceUnit(user.units)}
            />
          )}

          {/* These two hold local state seeded from the day's row, so the key
          carries that row's id: resetting the day deletes the row, the id
          changes, and both remount clean instead of showing stale ticks. */}
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
        </div>

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
                &ldquo;squats 5x5 at 100kg&rdquo; and the like &mdash; or add it
                by hand.
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
                  {rules.find((r) => r.id === ruleId)?.label} used this week on{" "}
                  {prettyDate(usedOn, today)}.
                </li>
              ))}
            </ul>
          )}

          <DayNote
            key={`note-${date}-${todayLog?.id ?? "empty"}`}
            date={date}
            initial={todayLog?.note ?? ""}
          />

          <Link href="/log" className="btn-ghost w-full">
            History and by-hand entry →
          </Link>

          <ResetDay date={date} label={prettyDate(date, today)} />
        </div>
      </div>
    </main>
  );
}
