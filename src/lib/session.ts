import { cookies } from "next/headers";

const COOKIE = "laflofit_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 16) {
    throw new Error(
      "AUTH_SECRET is missing or too short. Run `npm run db:setup` to generate " +
        "one, or set it in your Vercel environment variables.",
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
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function endSession() {
  const store = await cookies();
  store.delete(COOKIE);
}

/** The signed-in user's id, or null if the cookie is missing, forged or stale. */
export async function sessionUserId(): Promise<string | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;

  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const [userId, expires, signature] = parts;

  if (!Number(expires) || Number(expires) * 1000 < Date.now()) return null;

  const valid = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(),
    Buffer.from(signature, "base64url"),
    new TextEncoder().encode(`${userId}.${expires}`),
  );

  return valid ? userId : null;
}
