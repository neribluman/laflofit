import "server-only";
import { z } from "zod";
import { structured } from "./llm";
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
        .describe(
          "what they did WELL this week, at most 14 words, lower case, no full stop. Name the thing they topped or the figure they earned. Everyone has something — find it. A dig is allowed only after the credit.",
        ),
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

LENGTH
One line per person, fourteen words at most. Long enough to say what they
actually did, short enough that the whole thing still reads on one screen. If
you have written a clause and then a clause explaining it, delete the second.

The numbers are printed for you on a line above each person — days logged,
sessions, calories a day, protein per kilo. Do not repeat them. Your
line says what those numbers MEAN: what they topped, what they earned, what
changed. "won training outright and never missed a Tuesday" beats "trained
four days", because the four is already on the screen.

The test: if a figure in your line already appears on the line above it,
rewrite the line. "four days logged, four trained" is the stats line read
back; it costs a whole sentence and tells them nothing new.

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
- Credit first. Everyone did something worth naming — a category they topped,
  a number that beat everyone, a day they turned up when it was hard. Find it
  even for the person at the bottom.
- Never invent a figure. If you cite one, it is one you were given.
- Never guess anyone's pronouns. A name does not tell you them, and the
  scoreboard's "sex" field is not a pronoun either. The lines are short enough
  to write without pronouns at all — do that. If you genuinely need one, use
  they/them.
- The plan average is a percentage of that person's OWN plan, so it is not
  comparable between them — a strict six-rule plan and a calorie target are
  different exams. Use it only about one person on their own ("kept 68% of
  his own plan"), never to rank two people against each other.
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
  return `v5|${crewName}|${range}|${scoreboard(members)}`;
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
  members: RoastMember[],
): string {
  const medals = ["🥇", "🥈", "🥉"];
  const byName = new Map(members.map((m) => [m.name, m]));
  const scores = recap.lines.map((line) => byName.get(line.name)?.overallPoints ?? 0);

  const table = recap.lines.flatMap((line, i) => {
    const m = byName.get(line.name);
    if (!m) return [];
    // Equal scores share a place, so two people level both get gold rather
    // than one being quietly demoted by list order.
    const place = scores.findIndex((value) => value === scores[i]);
    const mark = scores[i] > 0 ? (medals[place] ?? "▫️") : "▫️";

    // The points total is meaningless outside the app, so the headline figure
    // is days logged — a number anyone can read cold in a group chat.
    const available = Math.min(7, Math.max(m.daysInCrew, m.daysLogged));
    // Every figure here has to mean something to someone reading it cold in a
    // group chat. The plan average doesn't: it is a percentage of that
    // person's own plan, so 25 and 68 are not the same exam and printing them
    // in a column invites exactly the wrong comparison. Days, sessions,
    // calories and grams need no key.
    const stats = [
      `${m.daysLogged}/${available} days`,
      m.sessions.length > 0
        ? `${m.sessions.length} session${m.sessions.length === 1 ? "" : "s"}`
        : null,
      m.caloriesPerDay != null
        ? `${m.caloriesPerDay.toLocaleString()} kcal a day`
        : null,
      m.proteinPerKg != null ? `${m.proteinPerKg.toFixed(1)} g/kg protein` : null,
    ]
      .filter(Boolean)
      .slice(0, 4)
      .join(" · ");

    return [`${mark} *${line.name}* — ${stats}`, `_${line.note}_`];
  });

  const logged = members.reduce((sum, m) => sum + m.daysLogged, 0);
  const sessions = members.reduce((sum, m) => sum + m.sessions.length, 0);
  const showedUp = members.filter((m) => m.daysLogged > 0).length;

  return [
    `*${crewName}* · ${range}`,
    "",
    recap.headline,
    "",
    ...table,
    "",
    `👏 ${recap.highlight}`,
    `👀 ${recap.callout}`,
    "",
    `_Between you: ${logged} days logged and ${sessions} sessions, from ${showedUp} of ${members.length}._`,
  ].join("\n");
}

export async function writeRecap(
  crewName: string,
  range: string,
  members: RoastMember[],
): Promise<Recap> {
  const { value } = await structured({
    task: "recap",
    schema: Recap,
    schemaName: "Recap",
    system: SYSTEM,
    maxTokens: 2000,
    effort: "high",
    content: [{ type: "text", text: [
          `Crew: "${crewName}". The last seven days (${range}), ordered by their overall standing:\n`,
          scoreboard(members),
          `\n\nWrite the week up. One line each, in this order, seven words each.`,
          `Use their names exactly as spelled above.`,
        ].join("\n") }],
  });

  const recap = value;

  // Names come back as free text, and the order decides who gets the medals.
  const known = new Map(members.map((m, i) => [m.name, i]));
  return {
    ...recap,
    lines: recap.lines
      .filter((line) => known.has(line.name))
      .sort((a, b) => known.get(a.name)! - known.get(b.name)!),
  };
}
