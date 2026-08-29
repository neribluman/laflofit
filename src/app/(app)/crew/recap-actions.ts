"use server";

import { sql, sqlOne } from "@/lib/db";
import { currentUser } from "@/lib/data";
import { addDays, todayIn } from "@/lib/dates";
import { canInterpret } from "@/lib/interpret";
import { digestOf, toWhatsApp, writeRecap } from "@/lib/recap";
import { roastInput } from "@/lib/standings";

/** "22–28 Aug", or "28 Jul – 3 Aug" when the week straddles two months. */
function rangeLabel(from: string, to: string): string {
  const fmt = (iso: string, withMonth: boolean) => {
    const [y, m, d] = iso.split("-").map(Number);
    const at = new Date(Date.UTC(y, m - 1, d));
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      ...(withMonth ? { month: "short" as const } : {}),
      timeZone: "UTC",
    }).format(at);
  };
  const sameMonth = from.slice(0, 7) === to.slice(0, 7);
  return `${fmt(from, !sameMonth)}–${fmt(to, true)}`;
}

export async function weeklyRecap(): Promise<{ message: string } | null> {
  const user = await currentUser();
  if (!user || !canInterpret()) return null;

  const today = todayIn(user.timezone);
  const range = rangeLabel(addDays(today, -6), today);

  const input = await roastInput(user.crew_id, today);
  if (!input) return null;

  const digest = digestOf(input.crewName, range, input.members);

  const existing = await sqlOne<{ message: string }>`
    select message from crew_recaps
    where crew_id = ${user.crew_id} and for_date = ${today}::date and digest = ${digest}
  `;
  if (existing) return { message: existing.message };

  let message: string;
  let body: unknown;
  try {
    const recap = await writeRecap(input.crewName, range, input.members);
    body = recap;
    message = toWhatsApp(recap, input.crewName, range, input.members);
  } catch {
    return null;
  }

  await sql`
    insert into crew_recaps (crew_id, for_date, digest, body, message)
    values (${user.crew_id}, ${today}::date, ${digest}, ${JSON.stringify(body)}::jsonb, ${message})
    on conflict (crew_id, for_date) do update
      set digest = excluded.digest, body = excluded.body,
          message = excluded.message, created_at = now()
  `;

  return { message };
}
