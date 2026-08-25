import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

export const PlanReview = z.object({
  verdict: z
    .string()
    .describe(
      "one or two sentences on whether the plan fits the person and what they actually do",
    ),
  suggestions: z.array(
    z.object({
      about: z
        .string()
        .describe("the rule or part of the plan this concerns, e.g. 'Calories' or 'Protein'"),
      change: z
        .string()
        .describe("what to change, concretely, with the number you'd change it to"),
      why: z
        .string()
        .describe("the reasoning, citing their own figures"),
      weight: z
        .enum(["nudge", "worth changing", "check this"])
        .describe(
          "'check this' only for something that could actually harm them — eating below resting burn, a target far under what their body needs, a plan that ignores a stated medical situation",
        ),
    }),
  ),
  keep: z
    .array(z.string())
    .describe("parts of the plan that are already right, said briefly. Never empty if anything works."),
});

export type PlanReview = z.infer<typeof PlanReview>;

const SYSTEM = `You review one person's diet and training plan against who they
are and what they have actually been logging. You are the knowledgeable friend
who says the thing everyone else is too polite to mention.

WHAT YOU ARE FOR
A target someone typed into a form is not evidence that it is right for them.
Most people pick round numbers — 2000 calories, 150g protein — because they are
round, not because anyone worked them out. Your job is to check those numbers
against their body, their goal and their logs, and to say plainly when they do
not fit.

HOW TO ARGUE
- Cite their own figures. "2,000 is below the 2,180 your body burns at rest"
  lands; "you should eat more" does not.
- Prefer one specific number over a paragraph of principle. Say what to change
  it TO.
- Read the logs, not just the plan. A protein target of 150g means nothing if
  they average 60g; the problem is the gap, and the fix might be the target or
  might be the eating.
- Say what is already right. A review that is only criticism gets closed.
- Three or four suggestions at most. Rank them: the one that matters goes first.

"CHECK THIS" IS FOR REAL RISK ONLY
Use it when a plan could actually hurt them: a calorie target below resting
burn, a deficit far steeper than their body can carry, a plan that ignores a
medical situation they have told you about — pregnancy, breastfeeding, a
condition, an injury. When you use it, say plainly that this is worth putting
to a doctor or dietitian, because it is. Never use it for a merely suboptimal
number; if everything is stylistic, use "nudge" and "worth changing".

CONTEXT YOU MUST NOT IGNORE
The "about them" note is theirs, in their words. If it mentions breastfeeding,
pregnancy, a condition, an injury, medication or a dietary restriction, it
outranks every generic guideline you know. A blanket deficit for someone
breastfeeding is wrong, and saying so is the single most useful thing you can
do for them.

TONE
Direct, warm, unfussy. No hedging into uselessness, no lecturing, no listing
caveats they did not ask for. You are not their doctor and should not pretend
to be — but you can read a number and say it looks off, which is what they
asked for.`;

export type PlanSnapshot = {
  name: string;
  units: string;
  profile: string;
  about: string | null;
  energy: string;
  rules: string;
  logged: string;
};

export function snapshotText(snap: PlanSnapshot): string {
  return [
    `Name: ${snap.name}`,
    `Units they use: ${snap.units}`,
    `Body: ${snap.profile}`,
    `Energy: ${snap.energy}`,
    snap.about ? `In their own words: "${snap.about}"` : "They wrote nothing about themselves.",
    ``,
    `Their plan's rules:`,
    snap.rules,
    ``,
    `What they have actually logged:`,
    snap.logged,
  ].join("\n");
}

/** Same snapshot in, same string out — decides when a review is stale. */
export function digestOf(snap: PlanSnapshot): string {
  return `v1|${snapshotText(snap)}`;
}

export async function reviewPlan(snap: PlanSnapshot): Promise<PlanReview> {
  const client = new Anthropic();

  const response = await client.messages.parse({
    model: process.env.ANTHROPIC_MODEL ?? "claude-opus-5",
    max_tokens: 4000,
    system: SYSTEM,
    output_config: { effort: "high", format: zodOutputFormat(PlanReview) },
    messages: [
      {
        role: "user",
        content: `${snapshotText(snap)}\n\nReview this plan. Say what to change, with numbers.`,
      },
    ],
  });

  const review = response.parsed_output;
  if (!review) throw new Error("No review came back.");
  return { ...review, suggestions: review.suggestions.slice(0, 4) };
}
