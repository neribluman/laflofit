import type { User } from "@/lib/types";

const SIZES = { sm: "h-6 w-6 text-xs", md: "h-9 w-9 text-base", lg: "h-14 w-14 text-2xl" };

/**
 * Photo if there is one, the chosen emoji otherwise. The emoji stays the
 * fallback rather than being replaced, so a crew where nobody has taken a
 * photo still looks like something.
 */
export default function Avatar({
  user,
  size = "sm",
  code,
}: {
  user: Pick<User, "id" | "emoji" | "display_name"> & { has_avatar?: boolean };
  size?: keyof typeof SIZES;
  /** Invite code, for the sign-in and invite screens where there's no session. */
  code?: string;
}) {
  const shared = `${SIZES[size]} shrink-0 rounded-full object-cover`;

  if (user.has_avatar) {
    return (
      // Plain img on purpose: these are already 256px squares from our own
      // route, so next/image would add a proxy hop and optimisation cost for
      // an image that is finished.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/avatar/${user.id}${code ? `?code=${encodeURIComponent(code)}` : ""}`}
        alt=""
        width={56}
        height={56}
        className={`${shared} bg-surface-2`}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={`${SIZES[size]} inline-flex shrink-0 items-center justify-center rounded-full bg-surface-2`}
    >
      {user.emoji}
    </span>
  );
}
