import Link from "next/link";
import { redirect } from "next/navigation";
import { crewByCode, crewRoster, currentUser } from "@/lib/data";
import Avatar from "@/components/Avatar";

/**
 * Where an invite link lands. The code is in the URL, so nobody has to read
 * one out or type it — the page just says which crew this is and gets out of
 * the way.
 */
export default async function JoinPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const crew = await crewByCode(code);

  if (!crew) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-12 text-center">
        <h1 className="text-2xl font-bold tracking-tight">
          That invite doesn&apos;t work
        </h1>
        <p className="mt-2 text-sm text-muted">
          The link may be out of date. Ask whoever sent it for a fresh one.
        </p>
        <Link href="/login" className="btn-ghost mt-6">
          Sign in instead
        </Link>
      </main>
    );
  }

  const me = await currentUser();
  if (me?.crew_id === crew.id) redirect("/crew");

  const roster = await crewRoster(crew.id);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-12">
      <p className="text-center text-sm text-muted">You&apos;ve been invited to</p>
      <h1 className="mt-1 text-center text-3xl font-bold tracking-tight">
        {crew.name}
      </h1>

      {roster.length > 0 && (
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {roster.slice(0, 8).map((member) => (
            <span
              key={member.id}
              className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-xs"
            >
              <Avatar user={member} code={crew.invite_code} />
              {member.display_name}
            </span>
          ))}
        </div>
      )}

      <p className="mt-6 text-center text-sm text-muted">
        Track a diet and your training together. Everyone sees everyone
        else&apos;s week, which is rather the point.
      </p>

      <Link
        href={`/login?code=${crew.invite_code}&join=1`}
        className="btn-primary mt-7 w-full"
      >
        Join {crew.name}
      </Link>
      <Link
        href={`/login?code=${crew.invite_code}`}
        className="btn-quiet mt-2 w-full text-xs"
      >
        I&apos;m already in this crew
      </Link>
    </main>
  );
}
