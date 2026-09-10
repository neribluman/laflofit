import "server-only";
import { sql } from "./db";
import type { MealSlot } from "./types";

/**
 * The things somebody eats over and over, offered back as one tap.
 *
 * Two decisions carry this feature, and both were settled by looking at real
 * logs rather than by reasoning about them.
 *
 * FIRST: the quantity stays in the key. Grouping "2 eggs" with "4 eggs"
 * because both are "eggs" produced a suggestion whose calories ranged from 155
 * to 310 — a coin flip dressed as a shortcut. Keeping the number gives
 * "100g cottage cheese" a range of 98 to 98. What varies is only the model's
 * hedging — "(assumed ~100 g)", "approx", "roughly" — so that is all that gets
 * stripped.
 *
 * SECOND: the macros are the median of past loggings, not the latest. One
 * generous estimate shouldn't become the number you re-log forever, and a
 * median ignores it where an average would carry it.
 */

/** Logged this many times before it counts as a habit. */
export const TIMES_TO_COUNT = 3;

/** Only the last three months: what you ate in spring isn't your usual now. */
const WINDOW_DAYS = 90;

export type Usual = {
  /** Stable id for this food, derived from the words. */
  key: string;
  /** The most recent phrasing, which is the one they'll recognise. */
  label: string;
  times: number;
  slot: MealSlot | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fibre_g: number | null;
  /** True when it's already on today's log — offered, but not pushed. */
  loggedToday: boolean;
};

/**
 * Strip what the model added, keep what the person said.
 *
 * Parentheticals are always its hedging: "(assumed ~100 g)", "(1 scoop whey)".
 * Everything outside them — including every number — is the food.
 */
export function normalise(description: string): string {
  return description
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(approx\.?|about|roughly|around)\b/g, " ")
    .replace(/~/g, " ")
    // "150 g" and "150g" are the same portion written two ways.
    .replace(/(\d)\s+(g|kg|ml|l|oz|lb|lbs|cups?|tbsp|tsp)\b/g, "$1$2")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The food, without the model's working shown.
 *
 * Descriptions carry two kinds of bracket. "(assumed ~28g)" and "(given: 180
 * cal, 25g protein)" are the model explaining itself, and on a chip that
 * already prints the calories they are noise that pushes the actual food out
 * of view. But "(with oat milk)" is the food, and cutting it would change what
 * you're agreeing to — so only the hedging goes.
 */
export function prettyLabel(description: string): string {
  const cleaned = description
    .replace(/\s*\((?=[^)]*\b(assumed|given|approx|about|roughly|around|estimated|per the label|as stated|cal|kcal|protein)\b)[^)]*\)/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[,;]$/, "");
  // If the hedging was the whole description, keep the original: an empty
  // chip is worse than a cluttered one.
  return cleaned.length >= 3 ? cleaned : description.trim();
}

const median = (values: number[]): number | null => {
  const sorted = values.filter((v) => v != null).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  return Math.round(sorted[Math.floor(sorted.length / 2)]);
};

/** Which meal the clock suggests, so breakfast leads at breakfast time. */
export function slotNow(timezone: string): MealSlot {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      hour12: false,
      timeZone: timezone,
    }).format(new Date()),
  );
  if (hour >= 4 && hour < 11) return "breakfast";
  if (hour >= 11 && hour < 16) return "lunch";
  if (hour >= 16 && hour < 22) return "dinner";
  return "snack";
}

export async function usualsFor(
  userId: string,
  today: string,
  timezone: string,
  limit = 8,
): Promise<Usual[]> {
  const rows = await sql<{
    description: string;
    meal_date: string;
    slot: MealSlot | null;
    calories: number | null;
    protein_g: number | null;
    carbs_g: number | null;
    fat_g: number | null;
    fibre_g: number | null;
  }>`
    select description, meal_date::text as meal_date, slot,
           calories::float8 as calories, protein_g::float8 as protein_g,
           carbs_g::float8 as carbs_g, fat_g::float8 as fat_g,
           fibre_g::float8 as fibre_g
    from meals
    where user_id = ${userId}
      and meal_date >= (${today}::date - ${WINDOW_DAYS}::int)
    order by meal_date
  `;

  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = normalise(row.description);
    if (key.length < 2) continue;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  const now = slotNow(timezone);

  const usuals = [...groups.entries()]
    .filter(([, items]) => items.length >= TIMES_TO_COUNT)
    .map(([key, items]) => {
      const last = items[items.length - 1];
      // The slot it's usually eaten in, not the slot it was last eaten in.
      const slots = new Map<string, number>();
      for (const item of items) {
        if (item.slot) slots.set(item.slot, (slots.get(item.slot) ?? 0) + 1);
      }
      const usualSlot =
        ([...slots.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] as MealSlot) ?? null;

      return {
        key,
        label: prettyLabel(last.description),
        times: items.length,
        slot: usualSlot,
        calories: median(items.map((i) => i.calories!).filter((v) => v != null)),
        protein_g: median(items.map((i) => i.protein_g!).filter((v) => v != null)),
        carbs_g: median(items.map((i) => i.carbs_g!).filter((v) => v != null)),
        fat_g: median(items.map((i) => i.fat_g!).filter((v) => v != null)),
        fibre_g: median(items.map((i) => i.fibre_g!).filter((v) => v != null)),
        loggedToday: items.some((i) => i.meal_date === today),
        lastEaten: last.meal_date,
      };
    });

  // Ranked by what you're most likely to want *right now*, which is mostly a
  // question of the clock: nobody wants their dinner offered at breakfast.
  const daysSince = (date: string) =>
    Math.round(
      (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86400000,
    );

  return usuals
    .map((usual) => {
      let score = usual.times;
      // The clock is the strongest signal, so it outweighs a few extra logs.
      if (usual.slot === now) score *= 3;
      else if (usual.slot === "snack" || usual.slot === "drink") score *= 1.5;
      // Something eaten weekly beats something eaten daily two months ago.
      score /= 1 + daysSince(usual.lastEaten) / 21;
      // Already on today's log: still offered, because people do eat eggs
      // twice, but it shouldn't take a slot from something they haven't had.
      if (usual.loggedToday) score *= 0.35;
      return { usual, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ usual }) => {
      const { ...rest } = usual;
      return rest as Usual;
    });
}

/**
 * Look one up again at save time.
 *
 * The browser sends only the key, never the numbers. A tap therefore cannot
 * write calories of its own choosing — whatever goes in is derived here, from
 * that person's own history.
 */
export async function usualByKey(
  userId: string,
  today: string,
  timezone: string,
  key: string,
): Promise<Usual | null> {
  const all = await usualsFor(userId, today, timezone, 200);
  return all.find((usual) => usual.key === key) ?? null;
}
