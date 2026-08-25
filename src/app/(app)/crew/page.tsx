import { redirect } from "next/navigation";
import {
  commentsFor,
  crewById,
  crewRoster,
  currentUser,
  dayLogsBetween,
  entriesForLogs,
  exercisesForWorkouts,
  mealsBetween,
  measurementsFor,
  reactionsFor,
  rulesForPlans,
  workoutsBetween,
} from "@/lib/data";
import { addDays, daysBetween, prettyDate, todayIn } from "@/lib/dates";
import { lastNDays } from "@/lib/dates";
import { scoreDay, standingFor } from "@/lib/scoring";
import { kgToDisplay, weightUnit } from "@/lib/units";
import type { PlanRule } from "@/lib/types";
import Leaderboard, { type LeaderRow } from "@/components/Leaderboard";
import {
  calorieBoard,
  proteinBoard,
  strengthBoard,
  trainingBoard,
} from "@/lib/boards";
import Link from "next/link";
import Avatar from "@/components/Avatar";
import Reactions from "@/components/Reactions";
import CommentBox from "@/components/CommentBox";
import InviteCode from "./InviteCode";
import DayStrip, { type StripDay } from "@/components/DayStrip";
import { canInterpret } from "@/lib/interpret";

type FeedItem = {
  key: string;
  type: "day_log" | "workout";
  id: string;
  userId: string;
  date: string;
  headline: string;
  detail?: string;
};

export default async function CrewPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/login");

  const crew = await crewById(user.crew_id);
  if (!crew) redirect("/login");

  const today = todayIn(user.timezone);
  const monthAgo = addDays(today, -29);

  const { d } = await searchParams;
  const day =
    d && /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= today && d >= monthAgo ? d : today;

  const roster = await crewRoster(crew.id);
  const ids = roster.map((member) => member.id);

  const [logs, workouts, measurements, meals] = await Promise.all([
    dayLogsBetween(ids, monthAgo, today),
    workoutsBetween(ids, monthAgo, today),
    measurementsFor(ids),
    mealsBetween(ids, addDays(today, -6), today),
  ]);
  const exercises = await exercisesForWorkouts(workouts.map((w) => w.id));
  const workoutOwner = new Map(workouts.map((w) => [w.id, w.user_id]));

  // Everyone can be on a different plan, so score each log against its own rules.
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

  // ---- One score per person per day, built once --------------------------
  const scoreIndex = new Map<string, ReturnType<typeof scoreDay>>();
  for (const log of logs) {
    const rules =
      rulesByPlan.get(
        log.plan_id ?? roster.find((m) => m.id === log.user_id)?.active_plan_id ?? "",
      ) ?? [];
    scoreIndex.set(
      `${log.user_id}|${log.log_date}`,
      scoreDay(rules, entriesByLog.get(log.id) ?? [], true),
    );
  }

  // ---- Leaderboard: last 7 days ------------------------------------------
  const week = lastNDays(today, 7);

  const rows: LeaderRow[] = roster
    .map((member) => {
      const scoreByDate = new Map(
        logs
          .filter((log) => log.user_id === member.id)
          .map((log) => [log.log_date, scoreIndex.get(`${member.id}|${log.log_date}`)!]),
      );

      // Latest weight on file — every relative board needs it.
      const weightKg =
        [...measurements]
          .reverse()
          .find((m) => m.user_id === member.id && m.weight_kg != null)?.weight_kg ??
        null;

      const theirMeals = meals.filter((meal) => meal.user_id === member.id);
      const theirExercises = exercises.filter(
        (exercise) => workoutOwner.get(exercise.workout_id) === member.id,
      );
      const theirWorkouts = workouts.filter(
        (workout) => workout.user_id === member.id,
      );
      const theirRules =
        rulesByPlan.get(member.active_plan_id ?? "") ?? [];

      const standing = standingFor(week, scoreByDate, today);

      return {
        id: member.id,
        name: member.display_name,
        emoji: member.emoji,
        hasAvatar: member.has_avatar,
        isMe: member.id === user.id,
        daysInCrew: Math.max(1, daysBetween(member.created_at.slice(0, 10), today) + 1),
        standing,
        boards: {
          overall: {
            // The score is days multiplied by how much of the plan you kept, so
            // what it counts is clean days: follow the day completely and it is
            // worth one, half-follow it and it is worth half, never log it and
            // it is worth nothing. Shown that way because that sentence is the
            // whole model, and 339-out-of-an-invisible-700 was not.
            value: standing.points,
            display: `${(standing.points / 100).toFixed(1)}/7`,
            detail: "",
            missing: false,
          },
          training: trainingBoard(theirWorkouts, week),
          protein: proteinBoard(theirMeals, weightKg),
          calories: calorieBoard(theirMeals, member, theirRules, weightKg, today),
          strength: strengthBoard(theirExercises, weightKg),
        },
      };
    })
    .sort((a, b) => b.standing.points - a.standing.points);

  const loggedTodayCount = rows.filter((row) => row.standing.loggedToday).length;


  // ---- One day at a time, with that day's winner on top ------------------
  const dayMeals = await mealsBetween(ids, day, day);

  const dayRows = roster
    .map((member) => {
      const score = scoreIndex.get(`${member.id}|${day}`) ?? null;
      const theirMeals = dayMeals.filter((meal) => meal.user_id === member.id);
      const theirWorkouts = workouts.filter(
        (w) => w.user_id === member.id && w.workout_date === day,
      );
      const calories = theirMeals.reduce((sum, meal) => sum + (meal.calories ?? 0), 0);

      return {
        member,
        score,
        percent: score ? Math.round(score.ratio * 100) : null,
        calories: theirMeals.length > 0 ? calories : null,
        workouts: theirWorkouts,
      };
    })
    // Logged first, best first. Everyone who sat the day out falls to the end.
    .sort((a, b) => (b.percent ?? -1) - (a.percent ?? -1));

  // Logging a day and scoring nothing on it is not a win, even unopposed.
  const winner = dayRows[0]?.percent ? dayRows[0] : null;
  const dayLoggedCount = dayRows.filter((row) => row.percent != null).length;

  const stripDays: StripDay[] = lastNDays(today, 35).map((date) => {
    const scores = roster
      .map((member) => scoreIndex.get(`${member.id}|${date}`))
      .filter((score): score is NonNullable<typeof score> => Boolean(score));
    return {
      date,
      logged: scores.length > 0,
      // The crew's day, not one person's: the average of everyone who logged.
      ratio: scores.length
        ? scores.reduce((sum, score) => sum + score.ratio, 0) / scores.length
        : 0,
      perfect: scores.length > 0 && scores.every((score) => score.perfect),
    };
  });

  // ---- Weight movement over 30 days --------------------------------------
  const movement = roster
    .map((member) => {
      const theirs = measurements.filter(
        (m) =>
          m.user_id === member.id &&
          m.weight_kg != null &&
          m.measured_on >= monthAgo,
      );
      if (theirs.length < 2) return null;
      const deltaKg = theirs[theirs.length - 1].weight_kg! - theirs[0].weight_kg!;
      return { member, delta: kgToDisplay(deltaKg, user.units) };
    })
    .filter((value): value is NonNullable<typeof value> => value !== null);

  // Crew is the landing screen, so it should say when you're the one slacking.
  const myLogToday = logs.find(
    (log) => log.user_id === user.id && log.log_date === today,
  );
  const loggedToday =
    (myLogToday
      ? (entriesByLog.get(myLogToday.id) ?? []).some(
          (e) => e.checked != null || e.value != null,
        )
      : false) ||
    workouts.some((w) => w.user_id === user.id && w.workout_date === today);

  // ---- Feed ---------------------------------------------------------------
  const feedFrom = addDays(today, -9);
  const byId = new Map(roster.map((member) => [member.id, member]));

  const feed: FeedItem[] = [
    ...logs
      .filter((log) => log.log_date >= feedFrom)
      .map((log) => {
        const rules =
          rulesByPlan.get(
            log.plan_id ?? byId.get(log.user_id)?.active_plan_id ?? "",
          ) ?? [];
        const score = scoreDay(rules, entriesByLog.get(log.id) ?? [], true);
        return {
          key: `day_log:${log.id}`,
          type: "day_log" as const,
          id: log.id,
          userId: log.user_id,
          date: log.log_date,
          headline: score.perfect
            ? "nailed a perfect day"
            : `hit ${Math.round(score.ratio * 100)}% of the plan`,
          detail: log.note ?? undefined,
        };
      }),
    ...workouts
      .filter((workout) => workout.workout_date >= feedFrom)
      .map((workout) => ({
        key: `workout:${workout.id}`,
        type: "workout" as const,
        id: workout.id,
        userId: workout.user_id,
        date: workout.workout_date,
        headline: `trained — ${workout.kind}${
          workout.minutes ? `, ${workout.minutes} min` : ""
        }`,
        detail: workout.notes ?? undefined,
      })),
  ]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, 40);

  const targetIds = feed.map((item) => item.id);
  const [reactionRows, commentRows] = await Promise.all([
    reactionsFor(targetIds),
    commentsFor(targetIds),
  ]);

  const reactionsBy = new Map<string, typeof reactionRows>();
  for (const reaction of reactionRows) {
    reactionsBy.set(reaction.target_id, [
      ...(reactionsBy.get(reaction.target_id) ?? []),
      reaction,
    ]);
  }
  const commentsBy = new Map<string, typeof commentRows>();
  for (const comment of commentRows) {
    commentsBy.set(comment.target_id, [
      ...(commentsBy.get(comment.target_id) ?? []),
      comment,
    ]);
  }

  return (
    <main className="mx-auto max-w-lg space-y-8 lg:max-w-2xl">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{crew.name}</h1>
        <p className="mt-1 text-sm text-muted">
          {roster.length} member{roster.length === 1 ? "" : "s"}
        </p>
      </header>

      {!loggedToday && (
        <Link
          href="/today"
          className="card flex items-center gap-3 border-accent/40 bg-accent/5 p-4 hover:border-accent"
        >
          <span className="text-xl" aria-hidden>
            ✍️
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">
              You haven&apos;t logged today
            </span>
            <span className="block text-xs text-muted">
              Everyone can see the gap. Takes one sentence.
            </span>
          </span>
          <span className="text-muted">→</span>
        </Link>
      )}

      <section>
        <h2 className="label">Today</h2>
        <div className="card p-4">
          <ul className="flex flex-wrap gap-2">
            {rows.map((row) => (
              <li
                key={row.id}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
                  row.standing.loggedToday
                    ? "border-accent/50 bg-accent/10 text-text"
                    : "border-line bg-surface-2 text-muted"
                }`}
              >
                <Avatar
                  user={{
                    id: row.id,
                    emoji: row.emoji,
                    display_name: row.name,
                    has_avatar: row.hasAvatar,
                  }}
                />
                <span className="truncate">{row.name}</span>
                <span aria-hidden className={row.standing.loggedToday ? "text-accent" : ""}>
                  {row.standing.loggedToday ? "✓" : "·"}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">
            {loggedTodayCount} of {rows.length} logged today
            {loggedTodayCount === rows.length && rows.length > 1
              ? " — the whole crew."
              : "."}
          </p>
        </div>
      </section>

      <section>
        <h2 className="label">This week</h2>
        <Leaderboard rows={rows} roastable={canInterpret()} />
      </section>

      <section>
        <h2 className="label">Day by day</h2>
        <div className="space-y-3">
          <DayStrip
            days={stripDays}
            selected={day}
            today={today}
            hrefBase="/crew"
            earliest={monthAgo}
            note={
              dayLoggedCount === 0
                ? "Nobody logged this day."
                : `${dayLoggedCount} of ${roster.length} logged · crew average ${Math.round(
                    (dayRows
                      .filter((row) => row.percent != null)
                      .reduce((sum, row) => sum + row.percent!, 0) /
                      dayLoggedCount),
                  )}`
            }
          />

          <div className="card p-4">
            <p className="mb-3 flex items-baseline gap-2">
              <span className="text-sm font-semibold">
                {prettyDate(day, today)}
              </span>
              {winner && (
                <span className="text-xs text-muted">
                  won by {winner.member.display_name}
                </span>
              )}
            </p>

            {dayLoggedCount === 0 ? (
              <p className="text-sm text-muted">
                Nothing logged by anyone on this day.
              </p>
            ) : (
              <ol className="space-y-3">
                {dayRows.map((row, i) => {
                  const out = row.percent == null;
                  return (
                    <li key={row.member.id} className="flex items-baseline gap-2">
                      <span className="w-5 shrink-0 text-center">
                        {out ? (
                          <span className="text-xs text-muted">·</span>
                        ) : i === 0 && winner ? (
                          "🥇"
                        ) : (
                          <span className="nums text-xs text-muted">{i + 1}</span>
                        )}
                      </span>
                      <Avatar user={row.member} />
                      <span
                        className={`min-w-0 flex-1 truncate text-sm ${
                          i === 0 && !out ? "font-semibold" : ""
                        } ${out ? "text-muted" : ""}`}
                      >
                        {row.member.display_name}
                        {row.member.id === user.id && (
                          <span className="text-muted"> (you)</span>
                        )}
                        <span className="block text-xs text-muted">
                          {out
                            ? "didn't log"
                            : [
                                row.calories != null
                                  ? `${row.calories.toLocaleString()} kcal`
                                  : null,
                                ...row.workouts.map(
                                  (w) =>
                                    `${w.kind}${w.minutes ? ` ${w.minutes} min` : ""}`,
                                ),
                              ]
                                .filter(Boolean)
                                .join(" · ") || "logged, nothing else recorded"}
                        </span>
                      </span>
                      <span
                        className={`nums shrink-0 font-bold ${out ? "text-muted" : ""}`}
                      >
                        {out ? "—" : row.percent}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </div>
      </section>

      {movement.length > 0 && (
        <section>
          <h2 className="label">30-day weight change</h2>
          <ul className="card divide-y divide-line">
            {movement.map(({ member, delta }) => (
              <li
                key={member.id}
                className="flex items-center gap-3 px-4 py-3 text-sm"
              >
                <span aria-hidden>{member.emoji}</span>
                <span className="flex-1 truncate">{member.display_name}</span>
                <span className="nums font-semibold">
                  {delta > 0 ? "+" : ""}
                  {delta.toFixed(1)} {weightUnit(user.units)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="label">What everyone&apos;s been up to</h2>
        {feed.length === 0 ? (
          <p className="card p-4 text-sm text-muted">
            Quiet in here. Be the first to log something.
          </p>
        ) : (
          <ul className="space-y-3">
            {feed.map((item) => {
              const who = byId.get(item.userId);
              const reactions = reactionsBy.get(item.id) ?? [];
              const counts: Record<string, number> = {};
              for (const reaction of reactions) {
                counts[reaction.emoji] = (counts[reaction.emoji] ?? 0) + 1;
              }
              const comments = commentsBy.get(item.id) ?? [];

              return (
                <li key={item.key} className="card p-4">
                  <div className="flex items-baseline gap-2">
                    {who && <Avatar user={who} />}
                    <p className="min-w-0 flex-1 text-sm">
                      <span className="font-semibold">
                        {who?.display_name ?? "Someone"}
                      </span>{" "}
                      <span className="text-muted">{item.headline}</span>
                    </p>
                    <span className="shrink-0 text-xs text-muted">
                      {prettyDate(item.date, today)}
                    </span>
                  </div>

                  {item.detail && (
                    <p className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-sm">
                      {item.detail}
                    </p>
                  )}

                  <Reactions
                    targetType={item.type}
                    targetId={item.id}
                    counts={counts}
                    mine={reactions
                      .filter((reaction) => reaction.user_id === user.id)
                      .map((reaction) => reaction.emoji)}
                  />

                  {comments.length > 0 && (
                    <ul className="mt-2 space-y-1.5">
                      {comments.map((comment) => (
                        <li key={comment.id} className="text-sm">
                          <span className="font-medium">
                            {byId.get(comment.user_id)?.display_name ?? "Someone"}
                          </span>{" "}
                          <span className="text-muted">{comment.body}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  <CommentBox targetType={item.type} targetId={item.id} />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Last: inviting someone is a once-in-a-while errand, and it was
          sitting above the things people open this tab for. */}
      <InviteCode code={crew.invite_code} crewName={crew.name} />
    </main>
  );
}
