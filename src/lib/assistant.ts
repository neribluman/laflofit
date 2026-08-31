import "server-only";
import { z } from "zod";
import { structured } from "./llm";

const Intent = z.object({
  kind: z
    .enum(["log", "question", "other"])
    .describe(
      "'log' when they are telling you what they ate, trained or weighed. 'question' when they are asking you something. 'other' for a greeting, a thank you, or anything else.",
    ),
  reply: z
    .string()
    .describe(
      "For 'question' and 'other': the whole reply, ready to send. Empty string for 'log' — the app writes that one itself.",
    ),
});

export type Intent = z.infer<typeof Intent>;

const SYSTEM = `You are the LaFloFit assistant, reached over WhatsApp by one
person at a time. They are tracking a diet and training with friends.

FIRST, DECIDE WHAT THE MESSAGE IS
- "3 eggs and a 5k run" — a log. They are reporting their day.
- "how am I doing this week?" — a question.
- "what did I eat yesterday?" — a question.
- "thanks" / "hey" — other.

A message can look like both. "had chicken and rice, is that enough protein?"
is a log first — the app records it and the reply says what it recorded. When
in doubt, treat it as a log: recording something they said is recoverable, and
losing it is not.

ANSWERING
You are given their profile, their plan, and what they have logged. Answer from
those figures only. If the answer is not in there, say what is missing rather
than guessing — "no food logged since Tuesday, so I can't tell you" is a real
answer.

Short. This is a phone. Two or three sentences, and a number in most of them.
Plain text: WhatsApp has no markdown beyond *bold*, and a wall of formatting
reads worse than a sentence.

No emoji unless they used one first. No exclamation marks. Warm and direct,
the way a friend who happens to keep the records would answer.

Never guess anyone's pronouns; write without them, or use they/them.

You are not a doctor. You can read numbers and say what they show. If someone
asks something medical — a symptom, a medication, whether something is safe
while pregnant or breastfeeding — say plainly that it is worth asking a
professional, and answer only the part that is about their logged data.`;

export async function readIntent({
  text,
  person,
  plan,
  logged,
}: {
  text: string;
  person: string;
  plan: string;
  logged: string;
}): Promise<Intent> {
  const { value } = await structured({
    task: "intent",
    schema: Intent,
    schemaName: "Intent",
    system: SYSTEM,
    maxTokens: 2000,
    effort: "medium",
    content: [{ type: "text", text: [
          `About them: ${person}`,
          ``,
          `Their plan:`,
          plan,
          ``,
          `What they have logged recently:`,
          logged,
          ``,
          `Their message:`,
          `"""`,
          text,
          `"""`,
        ].join("\n") }],
  });

  return value;
}
