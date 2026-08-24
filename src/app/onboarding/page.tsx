import Link from "next/link";
import { redirect } from "next/navigation";
import { crewById, currentUser, plansForCrew } from "@/lib/data";
import { todayIn } from "@/lib/dates";
import { canInterpret } from "@/lib/interpret";
import { lengthUnit, weightUnit } from "@/lib/units";
import PlanStep from "./PlanStep";
import IntakeSurvey from "./IntakeSurvey";

const STEPS = ["You", "Plan"] as const;

export default async function Onboarding({
  searchParams,
}: {
  searchParams: Promise<{ skip?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const { skip } = await searchParams;
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
          <p className="mt-1.5 mb-7 text-sm text-muted">
            Eight quick questions. It calibrates everything else — a portion is
            only big or small relative to the person eating it. Skip anything you
            would rather not answer.
          </p>

          <IntakeSurvey
            thisYear={Number(today.slice(0, 4))}
            weightUnit={weightUnit(user.units)}
            lengthUnit={lengthUnit(user.units)}
            emoji={user.emoji}
          />

          <Link href="/onboarding?skip=1" className="btn-quiet mt-2 w-full">
            Skip for now
          </Link>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-bold tracking-tight">Choose your plan</h1>
          <p className="mt-1.5 mb-6 text-sm text-muted">
            A plan is a short checklist you face every evening. Pick one to
            start from — every rule stays editable afterwards.
          </p>
          <PlanStep
            crewName={crew.name}
            existingPlans={plans}
            canDraft={canInterpret()}
          />
        </>
      )}
    </main>
  );
}
