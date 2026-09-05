import { redirect } from "next/navigation";
import { currentUser } from "@/lib/data";
import { todayIn } from "@/lib/dates";
import { leaderChase } from "@/lib/chase";
import NavBar from "@/components/NavBar";
import LeaderChase from "@/components/LeaderChase";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!user.active_plan_id) redirect("/onboarding");

  // In the layout rather than on one page: following you between tabs is the
  // joke. It returns null the moment you log today, so it can't outstay it.
  const chaser = await leaderChase(user.crew_id, user.id, todayIn(user.timezone));

  return (
    <div className="min-h-dvh pb-20">
      <div className="mx-auto w-full max-w-lg px-4 pt-6 lg:max-w-5xl">{children}</div>
      {chaser && <LeaderChase leader={chaser} />}
      <NavBar />
    </div>
  );
}
