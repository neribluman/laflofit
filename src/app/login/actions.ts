"use server";

import { redirect } from "next/navigation";
import { sql, sqlOne } from "@/lib/db";
import { hashPin, isValidPin, verifyPin } from "@/lib/pin";
import { startSession } from "@/lib/session";
import { inviteCode } from "@/lib/codes";

export type AuthState = { error?: string };

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

function cleanName(value: FormDataEntryValue | null) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
}

/** Existing member signing in with their PIN. */
export async function signIn(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const userId = String(formData.get("user_id") ?? "");
  const pin = String(formData.get("pin") ?? "").trim();
  if (!isValidPin(pin)) return { error: "Your PIN is four digits." };

  const row = await sqlOne<{
    id: string;
    pin_hash: string;
    failed_attempts: number;
    locked: boolean;
  }>`
    select id, pin_hash, failed_attempts,
           (locked_until is not null and locked_until > now()) as locked
    from users where id = ${userId}
  `;
  if (!row) return { error: "We couldn't find you. Go back and try again." };

  if (row.locked) {
    return {
      error: `Too many wrong PINs. Try again in ${LOCK_MINUTES} minutes.`,
    };
  }

  if (!(await verifyPin(pin, row.pin_hash))) {
    const attempts = row.failed_attempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
      await sql`
        update users
        set failed_attempts = 0,
            locked_until = now() + make_interval(mins => ${LOCK_MINUTES})
        where id = ${row.id}
      `;
      return {
        error: `Too many wrong PINs. Locked for ${LOCK_MINUTES} minutes.`,
      };
    }
    await sql`update users set failed_attempts = ${attempts} where id = ${row.id}`;
    return {
      error: `Wrong PIN. ${MAX_ATTEMPTS - attempts} attempt${
        MAX_ATTEMPTS - attempts === 1 ? "" : "s"
      } left.`,
    };
  }

  await sql`
    update users set failed_attempts = 0, locked_until = null where id = ${row.id}
  `;
  await startSession(row.id);
  redirect("/crew");
}

/** New person joining an existing crew with its invite code. */
export async function joinCrew(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const name = cleanName(formData.get("display_name"));
  const pin = String(formData.get("pin") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "UTC").slice(0, 64);

  if (name.length < 2) return { error: "Give us at least two characters." };
  if (!isValidPin(pin)) return { error: "Pick a four-digit PIN." };

  const crew = await sqlOne<{ id: string }>`
    select id from crews where invite_code = ${code}
  `;
  if (!crew) return { error: "That invite code doesn't match a crew." };

  const taken = await sqlOne<{ id: string }>`
    select id from users
    where crew_id = ${crew.id} and lower(display_name) = lower(${name})
  `;
  if (taken) {
    return {
      error: `Someone in this crew already goes by "${name}". Pick another name, or go back and tap yourself in the list.`,
    };
  }

  const user = await sqlOne<{ id: string }>`
    insert into users (crew_id, display_name, pin_hash, timezone)
    values (${crew.id}, ${name}, ${await hashPin(pin)}, ${timezone})
    returning id
  `;
  if (!user) return { error: "Could not create your account. Try again." };

  await startSession(user.id);
  redirect("/onboarding");
}

/** Starting a brand new crew. */
export async function startCrew(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const crewName = String(formData.get("crew_name") ?? "").trim().slice(0, 50);
  const name = cleanName(formData.get("display_name"));
  const pin = String(formData.get("pin") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "UTC").slice(0, 64);

  if (crewName.length < 2) return { error: "Your crew needs a name." };
  if (name.length < 2) return { error: "Give us at least two characters." };
  if (!isValidPin(pin)) return { error: "Pick a four-digit PIN." };

  // Retry on the astronomically unlikely code collision.
  let crew: { id: string } | null = null;
  for (let attempt = 0; attempt < 5 && !crew; attempt += 1) {
    try {
      crew = await sqlOne<{ id: string }>`
        insert into crews (name, invite_code)
        values (${crewName}, ${inviteCode()})
        returning id
      `;
    } catch (error) {
      if (attempt === 4) throw error;
    }
  }
  if (!crew) return { error: "Could not create the crew. Try again." };

  const user = await sqlOne<{ id: string }>`
    insert into users (crew_id, display_name, pin_hash, timezone)
    values (${crew.id}, ${name}, ${await hashPin(pin)}, ${timezone})
    returning id
  `;
  if (!user) return { error: "Could not create your account. Try again." };

  await startSession(user.id);
  redirect("/onboarding");
}
