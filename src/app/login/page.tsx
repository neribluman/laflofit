import Link from "next/link";
import { redirect } from "next/navigation";
import { crewByCode, crewRoster, currentUser } from "@/lib/data";
import PinForm from "./PinForm";
import JoinForm from "./JoinForm";
import Avatar from "@/components/Avatar";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; who?: string; join?: string }>;
}) {
  if (await currentUser()) redirect("/crew");

  const { code, who, join } = await searchParams;
  const crew = code ? await crewByCode(code) : null;
  const roster = crew ? await crewRoster(crew.id) : [];
  const picked = who ? roster.find((u) => u.id === who) : undefined;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-12">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight">
          La<span className="text-accent">Flo</span>Fit
        </h1>
        <p className="mt-2 text-sm text-muted">
          Track the diet. Log the training. Answer to your friends.
        </p>
      </div>

      {/* Step 1 — which crew? */}
      {!crew && (
        <>
          {code && (
            <p className="mb-4 rounded-xl border border-bad/40 bg-bad/10 px-4 py-3 text-center text-sm text-bad">
              No crew has the code <strong>{code.toUpperCase()}</strong>. Check
              it with whoever invited you.
            </p>
          )}
          <form method="GET" className="card p-6">
            <label className="label" htmlFor="code">
              Crew invite code
            </label>
            <input
              id="code"
              name="code"
              required
              maxLength={6}
              autoCapitalize="characters"
              autoFocus
              defaultValue={code ?? ""}
              className="field nums text-center text-2xl font-bold tracking-[0.4em] uppercase"
              placeholder="ABC123"
            />
            <button className="btn-primary mt-4 w-full">Continue</button>
            <p className="mt-3 text-center text-xs text-muted">
              Six characters, from whoever set up your crew.
            </p>
          </form>

          <p className="mt-6 text-center text-sm text-muted">
            Nobody&apos;s set one up yet?{" "}
            <Link href="/start" className="font-semibold text-accent">
              Start a crew
            </Link>
          </p>
        </>
      )}

      {/* Step 3 — PIN, once you've said who you are */}
      {crew && picked && (
        <>
          <PinForm
            userId={picked.id}
            name={picked.display_name}
            emoji={picked.emoji}
            hasAvatar={picked.has_avatar}
            code={crew.invite_code}
          />
          <Link
            href={`/login?code=${crew.invite_code}`}
            className="btn-quiet mt-4 w-full"
          >
            ← Not you?
          </Link>
        </>
      )}

      {/* Step 2b — new face in an existing crew */}
      {crew && !picked && join && (
        <>
          <JoinForm code={crew.invite_code} crewName={crew.name} />
          <Link
            href={`/login?code=${crew.invite_code}`}
            className="btn-quiet mt-4 w-full"
          >
            ← Back
          </Link>
        </>
      )}

      {/* Step 2a — who are you? */}
      {crew && !picked && !join && (
        <>
          <div className="card p-4">
            <p className="mb-3 text-center text-sm text-muted">
              Signing in to <span className="text-text">{crew.name}</span>
            </p>
            {roster.length > 0 && (
              <ul className="space-y-2">
                {roster.map((member) => (
                  <li key={member.id}>
                    <Link
                      href={`/login?code=${crew.invite_code}&who=${member.id}`}
                      className="btn-ghost w-full justify-start gap-3"
                    >
                      <Avatar user={member} size="md" code={crew.invite_code} />
                      <span className="truncate">{member.display_name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Link
            href={`/login?code=${crew.invite_code}&join=1`}
            className="btn-primary mt-3 w-full"
          >
            {roster.length > 0 ? "I'm new here" : "Join this crew"}
          </Link>
          <Link href="/login" className="btn-quiet mt-2 w-full">
            ← Different crew
          </Link>
        </>
      )}
    </main>
  );
}
