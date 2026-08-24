import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/data";
import StartForm from "./StartForm";

export default async function StartPage() {
  if (await currentUser()) redirect("/today");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-12">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Start a crew</h1>
        <p className="mt-2 text-sm text-muted">
          Accountability needs an audience. Set yours up, then send round the
          code.
        </p>
      </div>

      <StartForm />

      <Link href="/login" className="btn-quiet mt-6 w-full">
        ← I already have an invite code
      </Link>
    </main>
  );
}
