import Image from "next/image";

/** The logo above the name, on the screens you meet before signing in. */
export default function Wordmark({ tagline = true }: { tagline?: boolean }) {
  return (
    <div className="text-center">
      <Image
        src="/logo-192.png"
        alt=""
        width={72}
        height={72}
        priority
        className="mx-auto rounded-2xl"
      />
      <h1 className="mt-3 text-3xl font-bold tracking-tight">
        La<span className="text-accent">Flo</span>Fit
      </h1>
      {tagline && (
        <p className="mt-2 text-sm text-muted">
          Track the diet. Log the training. Answer to your friends.
        </p>
      )}
    </div>
  );
}
