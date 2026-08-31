/**
 * Replay the same logging messages through two models and diff what they wrote.
 *
 *   npx tsx --conditions=react-server scripts/compare-models.mts \
 *     anthropic/claude-opus-5 anthropic/claude-haiku-4-5
 *
 * The first model is the reference; the rest are measured against it. This is
 * the only honest way to decide whether a cheaper model is good enough here,
 * because the failure mode isn't a crash — it's a plausible wrong number that
 * lands silently in someone's diary and stays there.
 */
import fs from "node:fs";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  if (line.includes("=") && !line.startsWith("#")) {
    process.env[line.slice(0, line.indexOf("="))] = line.slice(line.indexOf("=") + 1);
  }
}

const { interpretDay } = await import("@/lib/interpret");
const { statedToKg } = await import("@/lib/units");

type Rule = {
  id: string;
  plan_id: string;
  label: string;
  kind: "do" | "avoid" | "count";
  unit: string | null;
  target: number | null;
  cadence: "daily" | "weekly";
  points: number;
  sort_order: number;
};

const rule = (id: string, label: string, kind: Rule["kind"], target?: number, unit?: string): Rule => ({
  id, plan_id: "p", label, kind, unit: unit ?? null, target: target ?? null,
  cadence: "daily", points: 2, sort_order: 0,
});

const RULES: Rule[] = [
  rule("r-cal", "Calories", "count", 2000, "kcal"),
  rule("r-pro", "Protein", "count", 150, "g"),
  rule("r-carb", "No white carbs (bread, rice, pasta, potato, cereal)", "avoid"),
  rule("r-water", "Water", "count", 3, "L"),
  rule("r-train", "Trained today", "do"),
];

/** Real shapes of message, not clean ones. Messy input is the whole job. */
const CASES = [
  "Two eggs and black coffee at 7, chicken caesar for lunch, beans and steak for dinner. 3L water.",
  "155 lbs 3x7 squat, bench 185 lbs 3x5, barbell row 185 3x7, 20 minutes bike",
  "squats 5x5 at 100kg then bench 3x8 at 70, 5k run after. 84.1kg this morning",
  "4 hard boiled eggs",
  "had a big bowl of pasta, caved. also 2 beers",
  "morning run 6km easy, then eggs and avocado on sourdough",
  "250g picanha steak grilled, 150g air fried fries, small rocket salad",
  "ashtanga yoga 75 min, felt brutal. protein shake after",
  "3 eggs, cottage cheese 150g, a jerky stick, 250g sirloin, weighed 100kg",
  "dead hang 2 min then 15 min rings, intense. eggs and a mozzarella avocado salad",
  "nothing much today honestly, just coffee",
  "walked the dog 25 min with the weighted vest, salmon and beans for dinner",
];

const models = process.argv.slice(2);
if (models.length < 2) {
  console.error("Give me at least two, e.g. anthropic/claude-opus-5 anthropic/claude-haiku-4-5");
  process.exit(1);
}

type Shot = {
  ok: boolean;
  error?: string;
  ms: number;
  kcal: number;
  protein: number;
  meals: number;
  kinds: string[];
  lifts: string[];
  rules: string[];
  weightKg: number | null;
};

async function run(model: string, text: string): Promise<Shot> {
  process.env.LLM_INTERPRET_DAY = model;
  const started = Date.now();
  try {
    const r = await interpretDay({
      text, rules: RULES as never, units: "metric",
      alreadyLogged: [], person: "Male, 38, 186cm, 100kg, moderately active.",
    });
    const sum = (pick: (m: (typeof r.meals)[number]) => number | null) =>
      Math.round(r.meals.reduce((t, m) => t + (pick(m) ?? 0), 0));
    return {
      ok: true,
      ms: Date.now() - started,
      kcal: sum((m) => m.calories),
      protein: sum((m) => m.protein_g),
      meals: r.meals.length,
      kinds: r.workouts.map((w) => w.kind).sort(),
      lifts: r.workouts
        .flatMap((w) => w.exercises ?? [])
        .filter((e) => e.weight != null)
        .map((e) => `${e.name.toLowerCase()}@${statedToKg(e.weight!, e.weight_unit ?? null, "metric").toFixed(0)}`)
        .sort(),
      rules: r.rules.map((x) => x.rule_id).sort(),
      weightKg: r.weight == null ? null : Number(statedToKg(r.weight, r.weight_unit ?? null, "metric").toFixed(1)),
    };
  } catch (error) {
    return {
      ok: false, error: String(error instanceof Error ? error.message : error),
      ms: Date.now() - started, kcal: 0, protein: 0, meals: 0,
      kinds: [], lifts: [], rules: [], weightKg: null,
    };
  }
}

const near = (a: number, b: number, tol = 0.15) =>
  a === 0 && b === 0 ? true : Math.abs(a - b) <= Math.max(a, b) * tol;
const same = (a: string[], b: string[]) => a.join("|") === b.join("|");

const scores = new Map<string, { checks: number; passed: number; ms: number; broke: number }>();
for (const m of models) scores.set(m, { checks: 0, passed: 0, ms: 0, broke: 0 });

for (const text of CASES) {
  console.log(`\n\x1b[1m"${text.slice(0, 72)}${text.length > 72 ? "…" : ""}"\x1b[0m`);
  const shots = new Map<string, Shot>();
  for (const model of models) shots.set(model, await run(model, text));

  const reference = shots.get(models[0])!;
  for (const model of models) {
    const shot = shots.get(model)!;
    const s = scores.get(model)!;
    s.ms += shot.ms;

    if (!shot.ok) {
      s.broke += 1;
      console.log(`  ${model.padEnd(34)} \x1b[31mFAILED\x1b[0m ${shot.error?.slice(0, 90)}`);
      continue;
    }

    const line =
      `${String(shot.kcal).padStart(5)} kcal  ${String(shot.protein).padStart(3)}g P  ` +
      `${shot.meals} item${shot.meals === 1 ? " " : "s"}  ` +
      `${shot.kinds.join("+") || "—"}  ${shot.lifts.length ? shot.lifts.join(" ") : ""}` +
      `${shot.weightKg ? `  ⚖ ${shot.weightKg}` : ""}`;

    if (model === models[0]) {
      console.log(`  ${model.padEnd(34)} ${line}   \x1b[2m(reference, ${shot.ms}ms)\x1b[0m`);
      continue;
    }

    const checks = [
      ["calories", near(shot.kcal, reference.kcal)],
      ["protein", near(shot.protein, reference.protein)],
      ["items", Math.abs(shot.meals - reference.meals) <= 1],
      ["workouts", same(shot.kinds, reference.kinds)],
      ["lifts", same(shot.lifts, reference.lifts)],
      ["rules", same(shot.rules, reference.rules)],
      ["weigh-in", shot.weightKg === reference.weightKg],
    ] as const;
    const failed = checks.filter(([, pass]) => !pass).map(([name]) => name);
    s.checks += checks.length;
    s.passed += checks.length - failed.length;

    console.log(
      `  ${model.padEnd(34)} ${line}   ${
        failed.length === 0 ? "\x1b[32m✓ agrees\x1b[0m" : `\x1b[33m≠ ${failed.join(", ")}\x1b[0m`
      } \x1b[2m(${shot.ms}ms)\x1b[0m`,
    );
  }
}

console.log(`\n\x1b[1m── summary over ${CASES.length} messages ──\x1b[0m\n`);
for (const model of models) {
  const s = scores.get(model)!;
  const avg = Math.round(s.ms / CASES.length);
  if (model === models[0]) {
    console.log(`  ${model.padEnd(34)} reference · ${avg}ms average${s.broke ? ` · ${s.broke} failed outright` : ""}`);
    continue;
  }
  const pct = s.checks ? Math.round((s.passed / s.checks) * 100) : 0;
  console.log(
    `  ${model.padEnd(34)} ${String(pct).padStart(3)}% agreement · ${avg}ms average` +
      `${s.broke ? ` · \x1b[31m${s.broke} failed outright\x1b[0m` : ""}`,
  );
}
console.log(
  `\n  Agreement is not correctness — the reference can be wrong too. Read the\n` +
    `  rows where they differ and decide which one you'd rather have in your diary.\n`,
);
