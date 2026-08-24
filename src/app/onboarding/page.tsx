import Link from "next/link";
import { redirect } from "next/navigation";
import { crewById, currentUser, plansForCrew } from "@/lib/data";
import { todayIn } from "@/lib/dates";
import { canInterpret } from "@/lib/interpret";
import { lengthUnit, weightUnit } from "@/lib/units";
import PlanStep from "./PlanStep";
import IntakeStep from "./IntakeStep";
import ProfileFields from "@/components/ProfileFields";

const STEPS = ["You", "Plan"] as const;

export default async function Onboarding({
  searchParams,
}: {
  searchParams: Promise<{ skip?: string; hand?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/login");

  const { skip, hand } = await searchParams;
  const today = todayIn(user.timezone);

  // Anything at all on file counts as done — this is asked once, not nagged.
  const knowsThem =
    user.birth_year != null ||
    user.height_cm != null ||
    user.sex != null ||
    Boolean(user.about);

  const onIntake = !knowsThem && skip !== "1";

  if (!onIntake && user.active_plan_id) redirect("/today");

  const [crew, plans] = await Promise.all([
    crewById(user.crew_id),
    onIntake ? Promise.resolve([]) : plansForCrew(user.crew_id),
  ]);
  if (!crew) redirect("/login");

  const step = onIntake ? 0 : 1;

  return (
    <main className="mx-auto w-full max-w-md px-5 py-10">
      <ol className="mb-7 flex items-center gap-2">
        {STEPS.map((label, i) => (
          <li key={label} className="flex flex-1 flex-col gap-1.5">
            <div className={`h-1 rounded-full ${i <= step ? "bg-accent" : "bg-line"}`} />
            <span
              className={`text-xs font-medium ${i === step ? "text-text" : "text-muted"}`}
            >
              {label}
            </span>
          </li>
        ))}
      </ol>

      {onIntake ? (
        <>
          <h1 className="text-2xl font-bold tracking-tight">Tell me about you</h1>
          <p className="mt-1.5 mb-6 text-sm text-muted">
            Age, size, how much you move, what you&apos;re after. It calibrates
            everything else — a portion is only big or small relative to the
            person eating it. All optional, and only you see it.
          </p>

          {canInterpret() && hand !== "1" ? (
            <>
              <IntakeStep
                thisYear={Number(today.slice(0, 4))}
                weightUnit={weightUnit(user.units)}
                lengthUnit={lengthUnit(user.units)}
              />
              <p className="mt-4 text-center text-sm text-muted">
                Or{" "}
                <Link href="/onboarding?hand=1" className="font-medium text-accent">
                  fill in the fields
                </Link>{" "}
                instead.
              </p>
            </>
          ) : (
            <ProfileFields user={user} today={today} submitLabel="Save and continue" />
          )}

          <Link href="/onboarding?skip=1" className="btn-quiet mt-2 w-full">
            Skip for now
          </Link>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-bold tracking-tight">Choose the rules</h1>
          <p className="mt-1.5 mb-6 text-sm text-muted">
            A plan is just a checklist you face every evening. Pick a starting
            point — you can rewrite every rule afterwards.
          </p>
          <PlanStep crewName={crew.name} existingPlans={plans} />
        </>
      )}
    </main>
  );
}
