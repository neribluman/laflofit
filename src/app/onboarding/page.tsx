import { redirect } from "next/navigation";
import { crewById, currentUser, plansForCrew } from "@/lib/data";
import PlanStep from "./PlanStep";

export default async function Onboarding() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.active_plan_id) redirect("/today");

  const [crew, plans] = await Promise.all([
    crewById(user.crew_id),
    plansForCrew(user.crew_id),
  ]);
  if (!crew) redirect("/login");

  return (
    <main className="mx-auto w-full max-w-md px-5 py-10">
      <h1 className="text-2xl font-bold tracking-tight">Choose the rules</h1>
      <p className="mt-1.5 mb-6 text-sm text-muted">
        A plan is just a checklist you face every evening. Pick a starting point
        — you can rewrite every rule afterwards.
      </p>

      <PlanStep crewName={crew.name} existingPlans={plans} />
    </main>
  );
}
