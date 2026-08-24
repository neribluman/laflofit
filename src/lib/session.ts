import { cookies } from "next/headers";

const COOKIE = "laflofit_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/**
 * When the app lives at laflo.pro/laflofit, the rest of laflo.pro is a
 * different application on the same domain. Scoping the cookie to our own
 * path means the browser never sends this session to it.
 */
const COOKIE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "/";

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 16) {
    throw new Error(
      process.env.VERCEL
        ? "AUTH_SECRET is not set for this deployment. Add it in Vercel: " +
          "Settings -> Environment Variables, tick Production, then redeploy. " +
          "Use the value `npm run db:setup` generated in your local .env.local, " +
          "so existing logins keep working."
        : "AUTH_SECRET is missing or too short. Run `npm run db:setup` to " +
          "generate one.",
    );
  }
  return value;
}

async function hmacKey() {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

const toBase64Url = (bytes: ArrayBuffer) =>
  Buffer.from(bytes).toString("base64url");

/**
 * The cookie is "<userId>.<expiry>.<signature>". It carries its own proof, so
 * there is no session table to look up and nothing to refresh.
 */
export async function startSession(userId: string) {
  const expires = Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS;
  const payload = `${userId}.${expires}`;
  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(),
    new TextEncoder().encode(payload),
  );

  const store = await cookies();
  store.set(COOKIE, `${payload}.${toBase64Url(signature)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: COOKIE_PATH,
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function endSession() {
  const store = await cookies();
  // Clear our own path and the root, so a session written before the app
  // moved under a base path cannot outlive the sign-out.
  for (const path of new Set([COOKIE_PATH, "/"])) {
    store.set(COOKIE, "", { path, maxAge: 0 });
  }
}

/** The signed-in user's id, or null if the cookie is missing, forged or stale. */
export async function sessionUserId(): Promise<string | null> {
  const jar = await cookies();

  // There can be more than one cookie of this name — a session set at "/"
  // before the app moved under a base path, say — and which one the parser
  // hands back is not something to rely on. Try them all; first valid wins.
  const candidates = jar.getAll().filter((c) => c.name === COOKIE);
  for (const candidate of candidates) {
    const userId = await verifyCookie(candidate.value);
    if (userId) return userId;
  }
  return null;
}

async function verifyCookie(raw: string): Promise<string | null> {
  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const [userId, expires, signature] = parts;

  if (!Number(expires) || Number(expires) * 1000 < Date.now()) return null;

  let valid = false;
  try {
    valid = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(),
      Buffer.from(signature, "base64url"),
      new TextEncoder().encode(`${userId}.${expires}`),
    );
  } catch {
    return null;
  }

  return valid ? userId : null;
}
