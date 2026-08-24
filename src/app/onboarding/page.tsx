import { redirect } from "next/navigation";
import { crewById, currentUser, plansForCrew } from "@/lib/data";
import { todayIn } from "@/lib/dates";
import { canInterpret } from "@/lib/interpret";
import { lengthUnit, weightUnit } from "@/lib/units";
import PlanStep from "./PlanStep";
import IntakeSurvey from "./IntakeSurvey";

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

  // The survey is a screen of its own: one question at a time, and nothing
  // standing above it repeating itself. The plan step keeps a normal page.
  if (onIntake) {
    // Top-aligned rather than centred: the steps are different heights, and
    // centring would make the question jump up and down between them.
    return (
      <main className="mx-auto w-full max-w-md px-5 pt-10 pb-16">
        <IntakeSurvey
          thisYear={Number(today.slice(0, 4))}
          weightUnit={weightUnit(user.units)}
          lengthUnit={lengthUnit(user.units)}
          skipAllHref="/onboarding?skip=1"
        />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-md px-5 py-10">
      <h1 className="text-2xl font-bold tracking-tight">Choose your plan</h1>
      <p className="mt-1.5 mb-6 text-sm text-muted">
        A plan is a short checklist you face every evening. Pick one to start
        from — every rule stays editable afterwards.
      </p>
      <PlanStep
        crewName={crew.name}
        existingPlans={plans}
        canDraft={canInterpret()}
      />
    </main>
  );
}
