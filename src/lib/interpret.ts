import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { WORKOUT_KINDS } from "./presets";
import type { PlanRule, Units } from "./types";
import { weightUnit } from "./units";
export { macroTotals } from "./macros";

/** Feature is off unless a key is configured, so the app still runs without one. */
export const canInterpret = () => Boolean(process.env.ANTHROPIC_API_KEY);

const DayReport = z.object({
  meals: z
    .array(
      z.object({
        description: z
          .string()
          .describe(
            "what they ate or drank, including any portion you had to assume, e.g. 'a few beers (assumed 3 x 330ml)'",
          ),
        slot: z
          .enum(["breakfast", "lunch", "dinner", "snack", "drink"])
          .nullable(),
        calories: z.number().nullable(),
        protein_g: z.number().nullable(),
        carbs_g: z.number().nullable(),
        fat_g: z.number().nullable(),
        fibre_g: z.number().nullable(),
        estimated: z
          .boolean()
          .describe("false only when they gave you the numbers themselves"),
      }),
    )
    .describe("every food and drink mentioned, one entry each"),
  rules: z.array(
    z.object({
      rule_id: z.string().describe("id of the rule this refers to"),
      met: z
        .boolean()
        .nullable()
        .describe(
          "for 'do' and 'avoid' rules: true if they followed it, false if they did not. null for 'count' rules.",
        ),
      value: z
        .number()
        .nullable()
        .describe("for 'count' rules: the number, in the rule's unit. null otherwise."),
      evidence: z
        .string()
        .describe("the words from their message that justify this, kept short"),
    }),
  ),
  workouts: z.array(
    z.object({
      kind: z.enum(WORKOUT_KINDS),
      minutes: z
        .number()
        .nullable()
        .describe("total session length if stated or clearly implied"),
      intensity: z.enum(["easy", "moderate", "hard"]),
      notes: z.string().nullable(),
      exercises: z
        .array(
          z.object({
            name: z.string().describe("the movement, e.g. 'Back squat', '5k run'"),
            sets: z.number().nullable(),
            reps: z.number().nullable().describe("reps per set, not the total"),
            weight: z
              .number()
              .nullable()
              .describe("load per rep, in the units they used"),
            distance: z
              .number()
              .nullable()
              .describe("distance covered, in the units they used"),
            minutes: z.number().nullable(),
            notes: z.string().nullable(),
          }),
        )
        .describe("what the session consisted of; empty if they gave no detail"),
    }),
  ),
  weight: z
    .number()
    .nullable()
    .describe("weight if they mentioned one, in their own units"),
  summary: z
    .string()
    .describe("one short sentence in their own voice, for the day's note"),
  unclear: z
    .array(z.string())
    .describe(
      "only things you genuinely could not act on at all — not things you estimated",
    ),
});

export type DayReport = z.infer<typeof DayReport>;
export type ReportedMeal = DayReport["meals"][number];
export type ReportedWorkout = DayReport["workouts"][number];

const SYSTEM = `You turn a person's free-text description of their day into structured entries for a diet and training tracker.

Capture everything they gave you. There are two separate jobs, and the second does not depend on the first:

1. MEALS AND MACROS — log every food and drink they mention, whatever their plan happens to be about. One entry per item, with your best estimate of calories, protein, carbs, fat and fibre. This is the part to be generous with:
   - Use standard portions when they don't give one. "A bowl of porridge" is a bowl of porridge; estimate it.
   - When a quantity is vague, assume a sensible amount and SAY SO in the description — "a few beers (assumed 3 x 330ml)". An honest estimate beats a blank.
   - If they give you numbers directly ("650 kcal, 40g protein"), use theirs and set estimated: false.
   - Round to whole numbers. These are estimates and shouldn't pretend otherwise.
   - Only skip an item if you truly cannot guess what it was.

2. PLAN RULES — the rules are a separate, stricter question. Report a rule when the message gives you reasonable grounds, and read it the way a sensible friend would rather than demanding proof:
   - An "avoid" rule is met when they stayed off the thing. "I had toast" means the no-white-carbs rule was NOT met (met: false). "No bread today" means it WAS met (met: true).
   - A "do" rule is met when they did it.
   - A "count" rule takes a number in that rule's unit. Convert units as needed, and fill it from the food you just logged where that makes sense — a calorie rule can be totalled from the meals.
   - Where the message really says nothing about a rule, leave that rule out. Silence about a rule is not a failure.

3. TRAINING — only deliberate sessions. Walking to the shops is not one; a deliberate walk is. One workout per distinct session: a gym session and an evening run are two workouts, while squats and bench inside one gym session are two exercises in one workout. Pick the closest kind from the list; a session that is mostly lifting is Strength even if it ended on a bike.

   Read gym shorthand the way a training partner would:
   - "5x5 squats at 100" is five sets of five reps at 100 per rep. Sets first, reps second.
   - "3x8-10" means three sets, and reps are a range — take the lower number.
   - "bench 70kg 3x8" is the same information in a different order. Work out which number is the load.
   - "ran 5k in 25 min" is one exercise with a distance and a time, not five sets.
   - "AMRAP", "to failure" or "a few sets" mean reps are unknown — leave reps null and say so in the exercise notes rather than guessing a number.
   - Bodyweight movements have no weight. Leave it null; do not put their bodyweight there.
   - If they just say "went to the gym" with no detail, that is still a workout. Leave exercises empty.

   Session length: use what they say. Add up per-exercise times only when those times cover the whole session. If one exercise happens to have a time and the rest do not, that time is NOT the session length — leave minutes null. An hour of lifting logged as "15 min" because the bike was the only timed part is wrong.

   Intensity: take their word for it — "felt easy", "brutal", "tough". Default to moderate when they say nothing.

When you are told about them — their size, age, how much they train, what they don't eat — use it. A portion is judged against the person eating it, and a session against the person doing it. If what they wrote contradicts what you know about them (a vegetarian describing steak), log what they wrote and note the contradiction in unclear rather than silently correcting either one.

Never invent food they didn't mention. Estimating the size of something they did mention is expected; inventing a meal is not. Use "unclear" only for things you could not act on at all.`;

export async function interpretDay({
  text,
  rules,
  units,
  alreadyLogged,
  person,
}: {
  text: string;
  rules: PlanRule[];
  units: Units;
  alreadyLogged: string[];
  /** One line about who they are, so portions and effort are judged in scale. */
  person?: string;
}): Promise<DayReport> {
  const client = new Anthropic();

  const ruleSheet = rules.map((rule) => ({
    id: rule.id,
    label: rule.label,
    kind: rule.kind,
    unit: rule.unit,
    target: rule.target,
    cadence: rule.cadence,
  }));

  const response = await client.messages.parse({
    // Overridable: set ANTHROPIC_MODEL=claude-haiku-4-5 for a cheaper, faster read.
    model: process.env.ANTHROPIC_MODEL ?? "claude-opus-5",
    max_tokens: 8000,
    system: SYSTEM,
    // Estimating portions takes a little more thought than plain extraction.
    output_config: { effort: "medium", format: zodOutputFormat(DayReport) },
    messages: [
      {
        role: "user",
        content: [
          person ? `About them: ${person}\n` : "",
          `Their plan's rules:\n${JSON.stringify(ruleSheet, null, 1)}`,
          alreadyLogged.length
            ? `\nAlready ticked today: ${alreadyLogged.join(", ")}`
            : "",
          `\nThey weigh themselves in ${weightUnit(units)}.`,
          `\nWhat they wrote about their day:\n"""\n${text}\n"""`,
        ].join("\n"),
      },
    ],
  });

  const parsed = response.parsed_output;
  if (!parsed) throw new Error("Could not read that. Try rephrasing?");

  // The model can only ever write to rules that exist on this plan.
  const known = new Set(rules.map((rule) => rule.id));
  return { ...parsed, rules: parsed.rules.filter((r) => known.has(r.rule_id)) };
}
