import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

export const Roast = z.object({
  verdict: z
    .string()
    .describe(
      "the whole crew's week in at most TWELVE words. No names. A fragment beats a sentence.",
    ),
  lines: z.array(
    z.object({
      name: z
        .string()
        .describe("exactly one of the member names you were given, spelled the same way"),
      line: z
        .string()
        .describe(
          "their week in at most EIGHT words. Lower case, no full stop. One number or one image, never both.",
        ),
    }),
  ),
});

export type Roast = z.infer<typeof Roast>;

export type RoastMember = {
  name: string;
  isLeader: boolean;
  /** 1 on the day they joined. Nobody is answerable for days before this. */
  daysInCrew: number;
  /** Their combined standing across the five contests, and where it came from. */
  overallPoints: number;
  standingLine: string;
  daysLogged: number;
  average: number;
  streak: number;
  loggedToday: boolean;
  daysTrained: number;
  sessions: string[];
  proteinPerKg: number | null;
  calorieScore: number | null;
  strengthRatio: number | null;
  weightChangeKg: number | null;
};

const SYSTEM = `You caption a leaderboard for a group of old friends tracking
their diets and training together. They are all Jewish, they are close, and they
have asked — in writing — to be roasted without mercy, because flattery has never
once got any of them to the gym.

LENGTH IS THE WHOLE JOB
Eight words per person. Not "about eight" — eight. A fragment, not a sentence.
Lower case, no full stop. If you have written a clause and then another clause,
delete the second one; it was the explanation, and explaining is what kills it.
The line should read like a caption under a photograph, or the thing you mutter
as someone walks past. Anything longer is a eulogy and they will stop reading.

VOICE
Dry, deadpan, Catskills. The register of a rabbi delivering a verdict he finds
personally disappointing, or a mother who is not angry, merely quietly devastated.
Understatement, never a punchline. The compliment and the insult in the same
breath, with no room left to soften either.

For rhythm only — these are about a chess club, and are here to show the shape
and length of the thing. Never reuse this wording, or any part of it:
  "brilliant opening, resigned by move nine"
  "undefeated, having played nobody"
  "studied the endgame, avoided the middlegame"
  "one game in march, still discussing it"

RULES
- One real number, or one image drawn from a real number. Never both, never two
  clauses joined by "and" — that is two jokes fighting.
- Nobody escapes, the leader least of all. Winning is its own character flaw.
- Hardest on whoever logged nothing — but only when they have had the time not
  to. See NEW ARRIVALS.
- Never cite a number the data does not contain. An invented figure is not a
  joke that went slightly wrong, it is a lie about your friend.

NEW ARRIVALS
Some of them joined days or hours ago. The scoreboard says how long each has
been here, and it is the only denominator that counts: someone who joined this
morning has an empty week because they were not in the crew for it, and telling
them they wasted seven days is simply false. Never hold days against a person
that predate them.

For anyone in their first day or two, the joke is the arrival itself — the
optimism, the clean record, what everyone else looked like once, how long the
enthusiasm is expected to last. It should still bite. It just has to be true.
- No exclamation marks. No "oy vey", no "mazel tov", no phonetic accent, no
  Yiddish sprinkled in as seasoning — the rhythm carries it, not props.

NEVER
- Anything about money, paying, cheapness, or bargaining. Not once, not obliquely.
- Anything about appearance, bodies, faces, or how anyone looks. Their weight is
  a number in a log — you may joke about the effort, never about the person.
- The Holocaust, Israel, politics, or religious observance as the butt.
- Anything you would not say to their face at the table, with their mother there.

The line is: you are ribbing your friends about being lazy, not doing a bit about
Jewish people. If a joke would land the same coming from a stranger, cut it.`;

/**
 * Only what a joke can be built from. Deliberately not the raw rows: the model
 * writes better from a scoreboard than from a database dump, and this way the
 * same input produces the same digest.
 */
function scoreboard(members: RoastMember[]): string {
  return members
    .map((m) => {
      // The denominator first: everything below it is only fair in its light.
      // History can predate the account — someone re-joining, or back-filling
      // an old diary — so never claim fewer days than they actually logged.
      const backfilled = m.daysLogged > m.daysInCrew;
      const available = Math.min(7, Math.max(m.daysInCrew, m.daysLogged));

      const here = backfilled
        ? `  in the crew ${m.daysInCrew} day${m.daysInCrew === 1 ? "" : "s"}, with older days back-filled from before that`
        : m.daysInCrew <= 1
          ? "  JOINED TODAY — has not had a week to waste"
          : m.daysInCrew < 7
            ? `  JOINED ${m.daysInCrew} DAYS AGO — only ${m.daysInCrew} of these 7 days were theirs`
            : `  in the crew ${m.daysInCrew} days`;

      const bits = [
        `${m.name}${m.isLeader ? " (currently top of the overall board)" : ""}`,
        `  overall ${m.overallPoints} points — ${m.standingLine}`,
        here,
        `  logged ${m.daysLogged} of the ${available} day${
          available === 1 ? "" : "s"
        } available to them, averaging ${m.average}/100`,
        `  trained ${m.daysTrained} day${m.daysTrained === 1 ? "" : "s"}${
          m.sessions.length ? `: ${m.sessions.join(", ")}` : ""
        }`,
        m.loggedToday ? "  logged today" : "  has not logged today",
      ];
      if (m.streak > 0) bits.push(`  ${m.streak}-day streak`);
      if (m.proteinPerKg != null)
        bits.push(`  protein ${m.proteinPerKg.toFixed(2)} g per kg bodyweight`);
      if (m.calorieScore != null)
        bits.push(`  calorie accuracy ${m.calorieScore}/100 against their own target`);
      if (m.strengthRatio != null)
        bits.push(`  lifts ${m.strengthRatio.toFixed(2)}x bodyweight across the big lifts`);
      if (m.weightChangeKg != null)
        bits.push(
          `  weight ${m.weightChangeKg > 0 ? "up" : "down"} ${Math.abs(m.weightChangeKg).toFixed(1)} kg over 30 days`,
        );
      return bits.join("\n");
    })
    .join("\n\n");
}

/**
 * Same numbers in, same string out — this is what decides when to rewrite.
 *
 * Bump VOICE whenever the prompt or the output shape changes, or every crew
 * keeps being served whatever was cached under the old one.
 */
const VOICE = 3;

export function digestOf(crewName: string, members: RoastMember[]): string {
  return `v${VOICE}|${crewName}|${scoreboard(members)}`;
}

export async function writeRoast(
  crewName: string,
  members: RoastMember[],
): Promise<Roast> {
  const client = new Anthropic();

  const response = await client.messages.parse({
    model: process.env.ANTHROPIC_MODEL ?? "claude-opus-5",
    max_tokens: 2000,
    system: SYSTEM,
    // Comedy is the one thing here worth thinking about properly.
    output_config: { effort: "high", format: zodOutputFormat(Roast) },
    messages: [
      {
        role: "user",
        content: [
          `The crew is called "${crewName}". This week's standings:\n`,
          scoreboard(members),
          `\n\nEight words each, hardest on whoever has done least.`,
          `Use their names exactly as spelled above.`,
        ].join("\n"),
      },
    ],
  });

  const roast = response.parsed_output;
  if (!roast) throw new Error("No ruling came back.");

  // Names come back as free text; anything that isn't a member is dropped
  // rather than rendered against nobody.
  const known = new Set(members.map((m) => m.name));
  return { ...roast, lines: roast.lines.filter((line) => known.has(line.name)) };
}
