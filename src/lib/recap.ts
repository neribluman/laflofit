import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { RoastMember } from "./roast";

export const Recap = z.object({
  headline: z
    .string()
    .describe("the week in one line, at most 14 words. No names unless one person truly defined it."),
  lines: z.array(
    z.object({
      name: z.string().describe("exactly one of the member names given, spelled the same way"),
      note: z
        .string()
        .describe("what they did, at most 7 words, lower case, no full stop. One real number."),
    }),
  ),
  highlight: z
    .string()
    .describe("the single best thing anyone did this week, at most 16 words, named and specific"),
  callout: z
    .string()
    .describe("one line pointing at whoever needs to show up, or at what next week is for. At most 14 words. Ribbing, never mean."),
});

export type Recap = z.infer<typeof Recap>;

const SYSTEM = `You write the weekly write-up for a group of friends tracking
their diets and training together. It gets pasted straight into their WhatsApp
group, so it has to survive being read on a phone between other messages.

LENGTH IS THE POINT
Nobody reads a long one. One line per person, seven words each. If you have
written a clause and then another clause explaining it, delete the second. The
whole thing should be readable in about fifteen seconds.

VOICE
Warm, dry, a bit competitive. The tone of someone reading out the scores at the
pub, not a fitness app. Specific numbers, because the numbers are the joke and
the proof at once — "four days, all logged before noon" beats "great
consistency". Nobody escapes, including whoever is winning.

They are all Jewish and close friends who like being ribbed. Understatement over
punchlines. No exclamation marks, no "oy vey", no phonetic accent, no Yiddish as
seasoning. Nothing about money, appearance, bodies, or anyone's medical
situation.

RULES
- Every line uses a real figure from the data. Never invent one.
- Someone who joined this week has not skipped days that predate them. The
  scoreboard says how long each has been here; that is the only denominator.
- Hardest on whoever logged nothing, and only when they had time not to.
- The highlight names one person and one thing. It is the line people will
  reply to, so make it the best one.`;

function scoreboard(members: RoastMember[]): string {
  return members
    .map((m) => {
      const bits = [
        `${m.name} — ${m.overallPoints} points overall${m.isLeader ? " (top)" : ""}`,
        `  ${m.standingLine}`,
        // History can predate the account — an import, a rejoin — so never
        // hand the model "joined 5 days ago" next to "logged 7 days" and let
        // it try to make sense of the contradiction.
        m.daysLogged > m.daysInCrew
          ? `  in the crew ${m.daysInCrew} days, with older days back-filled from before that`
          : m.daysInCrew <= 1
            ? "  JOINED TODAY — has not had a week"
            : m.daysInCrew < 7
              ? `  joined ${m.daysInCrew} days ago — only ${m.daysInCrew} of these 7 days were theirs`
              : null,
        `  logged ${m.daysLogged} of the ${Math.min(7, Math.max(m.daysInCrew, m.daysLogged))} days available to them, averaging ${m.average}/100 on their own plan`,
        `  trained ${m.daysTrained} day${m.daysTrained === 1 ? "" : "s"}${
          m.sessions.length ? `: ${m.sessions.join(", ")}` : ""
        }`,
        m.streak > 0 ? `  ${m.streak}-day streak` : null,
        m.proteinPerKg != null ? `  protein ${m.proteinPerKg.toFixed(2)} g/kg` : null,
        m.calorieScore != null ? `  calorie accuracy ${m.calorieScore}/100` : null,
        m.strengthRatio != null ? `  lifts ${m.strengthRatio.toFixed(2)}x bodyweight` : null,
        m.weightChangeKg != null
          ? `  weight ${m.weightChangeKg > 0 ? "up" : "down"} ${Math.abs(m.weightChangeKg).toFixed(1)} kg over 30 days`
          : null,
      ].filter(Boolean);
      return bits.join("\n");
    })
    .join("\n\n");
}

export function digestOf(crewName: string, range: string, members: RoastMember[]): string {
  return `v2|${crewName}|${range}|${scoreboard(members)}`;
}

/**
 * The finished message, assembled here rather than by the model.
 *
 * WhatsApp's own markup is *bold* and _italic_ — not markdown's — and it is
 * unforgiving: a stray asterisk shows up as an asterisk. Building the text in
 * code means the shape is the same every week no matter what comes back.
 */
export function toWhatsApp(
  recap: Recap,
  crewName: string,
  range: string,
  points: Map<string, number>,
): string {
  const medals = ["🥇", "🥈", "🥉"];

  // Equal scores share a place, so two people on 16 both get gold rather than
  // one of them being quietly demoted by list order.
  const scores = recap.lines.map((line) => points.get(line.name) ?? 0);
  const table = recap.lines.map((line, i) => {
    const place = scores.findIndex((value) => value === scores[i]);
    const mark = scores[i] > 0 ? (medals[place] ?? "▫️") : "▫️";
    return `${mark} *${line.name}* — ${scores[i]} · ${line.note}`;
  });

  return [
    `*${crewName}* · ${range}`,
    "",
    recap.headline,
    "",
    ...table,
    "",
    `👏 ${recap.highlight}`,
    `👀 ${recap.callout}`,
  ].join("\n");
}

export async function writeRecap(
  crewName: string,
  range: string,
  members: RoastMember[],
): Promise<Recap> {
  const client = new Anthropic();

  const response = await client.messages.parse({
    model: process.env.ANTHROPIC_MODEL ?? "claude-opus-5",
    max_tokens: 2000,
    system: SYSTEM,
    output_config: { effort: "high", format: zodOutputFormat(Recap) },
    messages: [
      {
        role: "user",
        content: [
          `Crew: "${crewName}". The last seven days (${range}), ordered by their overall standing:\n`,
          scoreboard(members),
          `\n\nWrite the week up. One line each, in this order, seven words each.`,
          `Use their names exactly as spelled above.`,
        ].join("\n"),
      },
    ],
  });

  const recap = response.parsed_output;
  if (!recap) throw new Error("No write-up came back.");

  // Names come back as free text, and the order decides who gets the medals.
  const known = new Map(members.map((m, i) => [m.name, i]));
  return {
    ...recap,
    lines: recap.lines
      .filter((line) => known.has(line.name))
      .sort((a, b) => known.get(a.name)! - known.get(b.name)!),
  };
}
