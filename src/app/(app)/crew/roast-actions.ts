"use server";

import { sql, sqlOne } from "@/lib/db";
import { currentUser } from "@/lib/data";
import { todayIn } from "@/lib/dates";
import { canInterpret } from "@/lib/interpret";
import { digestOf, writeRoast, type Roast } from "@/lib/roast";
import { roastInput } from "@/lib/standings";

/** Today's ruling if one has already been written for these exact numbers. */
export async function cachedRoast(
  crewId: string,
  date: string,
  digest: string,
): Promise<Roast | null> {
  const row = await sqlOne<{ body: Roast }>`
    select body from crew_banter
    where crew_id = ${crewId} and for_date = ${date}::date and digest = ${digest}
  `;
  return row?.body ?? null;
}

/**
 * Write one if there isn't a current one. Called from the browser after the
 * page has painted — it takes a few seconds, and the crew page is the first
 * thing anyone opens.
 */
export async function ensureRoast(): Promise<Roast | null> {
  const user = await currentUser();
  if (!user || !canInterpret()) return null;

  const today = todayIn(user.timezone);
  const input = await roastInput(user.crew_id, today);
  if (!input) return null;

  const digest = digestOf(input.crewName, input.members);
  const existing = await cachedRoast(user.crew_id, today, digest);
  if (existing) return existing;

  let roast: Roast;
  try {
    roast = await writeRoast(input.crewName, input.members);
  } catch {
    return null;
  }

  // One row per crew per day: a new digest overwrites, rather than stacking up
  // a dozen rulings because someone logged lunch.
  await sql`
    insert into crew_banter (crew_id, for_date, digest, body)
    values (${user.crew_id}, ${today}::date, ${digest}, ${JSON.stringify(roast)}::jsonb)
    on conflict (crew_id, for_date)
      do update set digest = excluded.digest, body = excluded.body, created_at = now()
  `;

  return roast;
}
