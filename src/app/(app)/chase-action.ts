"use server";

import { currentUser } from "@/lib/data";
import { todayIn } from "@/lib/dates";
import { leaderChase } from "@/lib/chase";
import type { Chaser } from "@/components/LeaderChase";

/**
 * Who's chasing you, asked for by the browser after the page has painted.
 *
 * This used to run in the layout, which put five database round trips —
 * about 200ms — in front of every single page render, including the one
 * right after you log. A joke has no business on the critical path.
 */
export async function whoIsChasing(): Promise<Chaser | null> {
  const user = await currentUser();
  if (!user) return null;
  return leaderChase(user.crew_id, user.id, todayIn(user.timezone));
}
