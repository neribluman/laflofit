import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { WORKOUT_KINDS } from "./presets";
import type { PlanRule, Units } from "./types";
import { weightUnit } from "./units";

/** Feature is off unless a key is configured, so the app still runs without one. */
export const canInterpret = () => Boolean(process.env.ANTHROPIC_API_KEY);

const DayReport = z.object({
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
      minutes: z.number().nullable(),
      intensity: z.enum(["easy", "moderate", "hard"]),
      notes: z.string().nullable(),
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
    .describe("anything they mentioned that you could not map onto a rule"),
});

export type DayReport = z.infer<typeof DayReport>;

const SYSTEM = `You turn a person's free-text description of their day into structured entries for a diet and training tracker.

Rules of the job:
- Only report a rule when the message gives you real evidence about it. Say nothing about the rest. A day they didn't mention is not a day they failed.
- An "avoid" rule is met when they stayed off the thing. "I had toast" means the no-white-carbs rule was NOT met (met: false). "No bread today" means it WAS met (met: true).
- A "do" rule is met when they did it.
- A "count" rule takes a number in that rule's unit. Convert if they used another unit.
- Be literal about quantities. "A couple of litres" is 2, "a few beers" is not a number at all — put that in unclear instead of guessing.
- Workouts: only real sessions. Walking to the shops is not a workout; a deliberate walk is.
- If something is ambiguous, leave it out and list it in unclear. Under-reporting is fine; inventing is not.`;

export async function interpretDay({
  text,
  rules,
  units,
  alreadyLogged,
}: {
  text: string;
  rules: PlanRule[];
  units: Units;
  alreadyLogged: string[];
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
    max_tokens: 4000,
    system: SYSTEM,
    // A short extraction, not a reasoning problem — low effort keeps it quick and cheap.
    output_config: { effort: "low", format: zodOutputFormat(DayReport) },
    messages: [
      {
        role: "user",
        content: [
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
