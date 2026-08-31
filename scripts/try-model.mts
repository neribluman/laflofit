/**
 * Does this model actually work for us? One message in, the answer or the
 * reason it failed out.
 *
 *   npx tsx --conditions=react-server scripts/try-model.mts openrouter/moonshotai/kimi-k2
 *
 * Run this before wiring a model into anything. The three ways a model fails
 * here are all invisible from the outside — the key isn't right, the model
 * can't hold a schema, or it holds the schema and puts nonsense in it — and
 * this tells the three apart.
 */
import fs from "node:fs";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  if (line.includes("=") && !line.startsWith("#")) {
    process.env[line.slice(0, line.indexOf("="))] = line.slice(line.indexOf("=") + 1);
  }
}

const spec = process.argv[2];
if (!spec) {
  console.error(
    "Give me a model, e.g.\n" +
      "  openrouter/moonshotai/kimi-k2\n" +
      "  openrouter/deepseek/deepseek-chat\n" +
      "  groq/llama-3.3-70b-versatile\n" +
      "  ollama/llama3.1        (running on your own machine)",
  );
  process.exit(1);
}

process.env.LLM_INTERPRET_DAY = spec;

const { routeFor } = await import("@/lib/llm");
const { interpretDay } = await import("@/lib/interpret");
const { statedToKg } = await import("@/lib/units");

const route = routeFor("interpret_day");
if (route.kind === "anthropic") {
  console.error(
    `\n  "${spec}" didn't resolve to an open provider — it fell back to Claude.\n` +
      `  That means either the provider name isn't one I know, or its API key\n` +
      `  isn't in .env.local. Check the warning printed just above this.\n`,
  );
  process.exit(1);
}

const RULES = [
  { id: "r-cal", plan_id: "p", label: "Calories", kind: "count", unit: "kcal", target: 2000, cadence: "daily", points: 2, sort_order: 0 },
  { id: "r-pro", plan_id: "p", label: "Protein", kind: "count", unit: "g", target: 150, cadence: "daily", points: 2, sort_order: 1 },
  { id: "r-carb", plan_id: "p", label: "No white carbs (bread, rice, pasta, potato)", kind: "avoid", unit: null, target: null, cadence: "daily", points: 2, sort_order: 2 },
  { id: "r-train", plan_id: "p", label: "Trained today", kind: "do", unit: null, target: null, cadence: "daily", points: 2, sort_order: 3 },
];

const MESSAGE =
  "Two eggs and black coffee at 7, chicken caesar for lunch, beans and steak for dinner. " +
  "Caved and had a slice of bread. Squats 5x5 at 155 lbs then bench 3x8 at 70kg. 100kg this morning.";

console.log(`\n  model     ${route.provider}/${route.model}`);
console.log(`  endpoint  ${route.base}`);
console.log(`\n  sending:  "${MESSAGE.slice(0, 68)}…"\n`);

const started = Date.now();
try {
  const r = await interpretDay({
    text: MESSAGE,
    rules: RULES as never,
    units: "metric",
    alreadyLogged: [],
    person: "Male, 38, 186cm, 100kg, moderately active.",
  });

  const kcal = r.meals.reduce((t, m) => t + (m.calories ?? 0), 0);
  const protein = r.meals.reduce((t, m) => t + (m.protein_g ?? 0), 0);

  console.log(`  \x1b[32mIt works.\x1b[0m  ${Date.now() - started}ms\n`);
  console.log(`  Food     ${r.meals.length} items, ${Math.round(kcal)} kcal, ${Math.round(protein)}g protein`);
  r.meals.forEach((m) => console.log(`             · ${m.description.slice(0, 62)}  ${m.calories ?? "—"} kcal`));
  for (const w of r.workouts) {
    console.log(`  Training ${w.kind}${w.minutes ? ` ${w.minutes} min` : ""} (${w.intensity})`);
    for (const e of w.exercises ?? []) {
      const kg = e.weight == null ? null : statedToKg(e.weight, e.weight_unit ?? null, "metric");
      console.log(`             · ${e.name} ${e.sets ?? "-"}x${e.reps ?? "-"}${kg ? ` @ ${kg.toFixed(1)} kg` : ""}`);
    }
  }
  if (r.weight != null) console.log(`  Weigh-in ${r.weight} ${r.weight_unit ?? "(unit not stated)"}`);
  console.log(`  Rules    ${r.rules.map((x) => `${x.rule_id}=${x.value ?? x.met}`).join(", ") || "none"}`);
  if (r.unclear.length) console.log(`  Unclear  ${r.unclear.join("; ")}`);

  console.log(
    `\n  Now check it against the model you trust before you rely on it:\n` +
      `    npx tsx --conditions=react-server scripts/compare-models.mts anthropic/claude-opus-5 ${spec}\n`,
  );
} catch (error) {
  const message = String(error instanceof Error ? error.message : error);
  console.log(`  \x1b[31mIt didn't work.\x1b[0m  ${Date.now() - started}ms\n`);
  console.log(`  ${message.slice(0, 500)}\n`);

  const hint = /401|403|invalid.*key|unauthor/i.test(message)
    ? "That reads like the API key. Check it's the right one and has credit."
    : /404|not.*found|no.*model|unknown model/i.test(message)
      ? "That reads like the model id. Copy it exactly from the provider's model list."
      : /schema|json|parse|could not produce valid/i.test(message)
        ? "The model answered but couldn't hold the shape we need. Some models can't do\n  schema-constrained output at all — try a bigger one, or use this model only for\n  the easy job (LLM_INTENT) where the shape is two fields."
        : /429|rate/i.test(message)
          ? "Rate limited. Wait a moment and run it again."
          : "Unrecognised error — the text above is whatever the provider said.";
  console.log(`  ${hint}\n`);
  process.exit(1);
}
