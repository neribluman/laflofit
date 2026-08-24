import { redirect } from "next/navigation";
import { currentUser } from "@/lib/data";
import NavBar from "@/components/NavBar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!user.active_plan_id) redirect("/onboarding");

  return (
    <div className="min-h-dvh pb-20">
      <div className="mx-auto w-full max-w-lg px-4 pt-6 lg:max-w-5xl">{children}</div>
      <NavBar />
    </div>
  );
}
