import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

/**
 * One place every model call goes through, so the model behind each job can be
 * chosen per job rather than for the whole app.
 *
 * The jobs are not equally hard and they do not fail equally badly. Reading
 * "two eggs and a 5k" into calories, macros and a workout is the difficult one,
 * and getting it wrong writes a wrong number into someone's diary where it
 * stays. Deciding whether a WhatsApp message is a log or a question is almost
 * trivial and a mistake costs one confused reply. Those two should not be
 * forced onto the same model just because they share a codebase.
 */
export type Task =
  | "interpret_day"
  | "interpret_plate"
  | "plan_request"
  | "intent"
  | "roast"
  | "recap"
  | "plan_review";

/**
 * OpenAI-compatible endpoints, which by now is nearly everyone. Adding one is
 * a line here plus its key in the environment.
 */
const PROVIDERS: Record<string, { base: string; keyVar: string }> = {
  groq: { base: "https://api.groq.com/openai/v1", keyVar: "GROQ_API_KEY" },
  together: { base: "https://api.together.xyz/v1", keyVar: "TOGETHER_API_KEY" },
  openrouter: { base: "https://openrouter.ai/api/v1", keyVar: "OPENROUTER_API_KEY" },
  deepinfra: { base: "https://api.deepinfra.com/v1/openai", keyVar: "DEEPINFRA_API_KEY" },
  fireworks: { base: "https://api.fireworks.ai/inference/v1", keyVar: "FIREWORKS_API_KEY" },
  cerebras: { base: "https://api.cerebras.ai/v1", keyVar: "CEREBRAS_API_KEY" },
  // Moonshot's own endpoint, if you'd rather go direct than through a router.
  moonshot: { base: "https://api.moonshot.ai/v1", keyVar: "MOONSHOT_API_KEY" },
  deepseek: { base: "https://api.deepseek.com", keyVar: "DEEPSEEK_API_KEY" },
  // Runs on your own machine. No key, and nothing leaves the building.
  ollama: { base: "http://localhost:11434/v1", keyVar: "OLLAMA_API_KEY" },
  // Anything else: set LLM_BASE_URL and LLM_API_KEY.
  custom: { base: "", keyVar: "LLM_API_KEY" },
};

/**
 * What each job runs on unless the environment says otherwise.
 *
 * Haiku costs a fraction of Opus and answers in a third of the time, and on
 * the twelve-message comparison it agreed with Opus 73% of the time with no
 * failures — its disagreements are portion estimates a few percent apart, not
 * mistakes. Measured on real messages, one log costs $0.0066 on Haiku against
 * $0.0555 on Opus.
 *
 * The three left on Opus are the ones where cheapness buys nothing. They run
 * occasionally rather than on every log, so they are already a rounding error
 * on the bill — and they are the parts people read out to each other or act on
 * medically, where a slightly worse answer is the whole cost.
 */
const DEFAULT_MODEL: Record<Task, string> = {
  interpret_day: "claude-haiku-4-5",
  interpret_plate: "claude-haiku-4-5",
  plan_request: "claude-haiku-4-5",
  intent: "claude-haiku-4-5",
  roast: "claude-opus-5",
  recap: "claude-opus-5",
  plan_review: "claude-opus-5",
};

const ENV_FOR: Record<Task, string> = {
  interpret_day: "LLM_INTERPRET_DAY",
  interpret_plate: "LLM_INTERPRET_PLATE",
  plan_request: "LLM_PLAN_REQUEST",
  intent: "LLM_INTENT",
  roast: "LLM_ROAST",
  recap: "LLM_RECAP",
  plan_review: "LLM_PLAN_REVIEW",
};

export type Route =
  | { kind: "anthropic"; provider: "anthropic"; model: string }
  | { kind: "openai"; provider: string; model: string; base: string; key: string };

/**
 * `LLM_INTERPRET_DAY=groq/llama-3.3-70b-versatile` picks a provider and model
 * for that job. Anything unset falls back to Claude, so this is opt-in per
 * job and an empty environment behaves exactly as before.
 */
export function routeFor(task: Task): Route {
  const setting = process.env[ENV_FOR[task]]?.trim();
  const fallback = {
    kind: "anthropic" as const,
    provider: "anthropic" as const,
    // ANTHROPIC_MODEL still overrides every job at once, for putting the whole
    // app on one model to compare.
    model: process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL[task],
  };
  if (!setting) return fallback;

  // Only the FIRST slash separates provider from model: a router's model ids
  // carry slashes themselves, as in openrouter/moonshotai/kimi-k2.
  const slash = setting.indexOf("/");
  if (slash < 0) return { ...fallback, model: setting };

  const name = setting.slice(0, slash);
  const model = setting.slice(slash + 1);
  if (name === "anthropic") return { kind: "anthropic", provider: "anthropic", model };

  const provider = PROVIDERS[name];
  if (!provider) {
    console.warn(`Unknown LLM provider "${name}" for ${task}; using Claude.`);
    return fallback;
  }

  const base = name === "custom" ? (process.env.LLM_BASE_URL ?? "") : provider.base;
  const key = process.env[provider.keyVar] ?? "";
  if (!base || (name !== "ollama" && !key)) {
    console.warn(`${provider.keyVar} is not set for ${task}; using Claude.`);
    return fallback;
  }
  return { kind: "openai", provider: name, model, base, key };
}

export type Block =
  | { type: "text"; text: string }
  | { type: "image"; dataUrl: string };

export type StructuredCall<T extends z.ZodType> = {
  task: Task;
  schema: T;
  schemaName: string;
  system: string;
  content: Block[];
  maxTokens: number;
  effort?: "low" | "medium" | "high";
};

export type StructuredResult<T> = {
  value: T;
  route: Route;
  /** Present when the provider reports it; open endpoints usually do. */
  usage?: { input: number; output: number };
};

export async function structured<T extends z.ZodType>(
  call: StructuredCall<T>,
): Promise<StructuredResult<z.infer<T>>> {
  const route = routeFor(call.task);
  const started = Date.now();

  const result =
    route.kind === "anthropic"
      ? await viaAnthropic(call, route)
      : await viaOpenAICompatible(call, route);

  // Set LLM_LOG_USAGE=1 to see what each job actually costs. Guessing at token
  // counts is how people end up optimising the job that was already cheap.
  if (process.env.LLM_LOG_USAGE) {
    const { input = 0, output = 0 } = result.usage ?? {};
    console.log(
      `[llm] ${call.task} ${route.provider}/${route.model} ` +
        `in=${input} out=${output} ${Date.now() - started}ms`,
    );
  }

  return result;
}

async function viaAnthropic<T extends z.ZodType>(
  call: StructuredCall<T>,
  route: Extract<Route, { kind: "anthropic" }>,
): Promise<StructuredResult<z.infer<T>>> {
  const client = new Anthropic();

  const content = call.content.map((block) =>
    block.type === "text"
      ? { type: "text" as const, text: block.text }
      : {
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: mediaTypeOf(block.dataUrl),
            data: block.dataUrl.slice(block.dataUrl.indexOf(",") + 1),
          },
        },
  );

  const ask = (effort: "low" | "medium" | "high" | null) =>
    client.messages.parse({
      model: route.model,
      max_tokens: call.maxTokens,
      system: call.system,
      output_config: {
        ...(effort ? { effort } : {}),
        format: zodOutputFormat(call.schema),
      },
      messages: [{ role: "user", content }],
    });

  let response;
  try {
    response = await ask(call.effort ?? "medium");
  } catch (error) {
    // Only the newer models take an effort setting; the smaller ones reject
    // the request outright rather than ignoring it. Since choosing a cheaper
    // model is the whole point of routing per task, that has to be absorbed
    // here rather than handed to every caller.
    if (!/does not support the effort parameter/i.test(String(error))) throw error;
    response = await ask(null);
  }

  const value = response.parsed_output;
  if (!value) throw new Error("The model returned nothing usable.");
  return {
    value,
    route,
    usage: {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
    },
  };
}

/**
 * The open-model path.
 *
 * Two things differ from Claude and both bite. Schema adherence is a request
 * rather than a guarantee, so the result is validated here and one repair
 * attempt is made with the validation error handed back — which is most of
 * what makes a weaker model usable at all. And `strict` json_schema is not
 * universally supported, so a rejection falls back to plain JSON mode with the
 * schema in the prompt.
 */
async function viaOpenAICompatible<T extends z.ZodType>(
  call: StructuredCall<T>,
  route: Extract<Route, { kind: "openai" }>,
): Promise<StructuredResult<z.infer<T>>> {
  // Routers reserve the whole max_tokens against your balance before the model
  // writes a word, so a generous ceiling can make a request unaffordable that
  // would have cost a fraction of it. LLM_MAX_TOKENS caps the ask; a reply that
  // needs more than the cap is truncated, and truncated JSON fails validation
  // loudly rather than saving half a day.
  const cap = Number(process.env.LLM_MAX_TOKENS) || 0;
  const maxTokens = cap > 0 ? Math.min(call.maxTokens, cap) : call.maxTokens;

  const jsonSchema = z.toJSONSchema(call.schema, { io: "output" });

  const messages: Record<string, unknown>[] = [
    { role: "system", content: call.system },
    {
      role: "user",
      content: call.content.map((block) =>
        block.type === "text"
          ? { type: "text", text: block.text }
          : { type: "image_url", image_url: { url: block.dataUrl } },
      ),
    },
  ];

  const ask = async (format: Record<string, unknown>) => {
    const response = await fetch(`${route.base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(route.key ? { Authorization: `Bearer ${route.key}` } : {}),
        // OpenRouter asks for these; they identify the app on its dashboards.
        ...(route.provider === "openrouter"
          ? {
              "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "https://laflofit.laflo.pro",
              "X-Title": "LaFloFit",
            }
          : {}),
      },
      body: JSON.stringify({
        model: route.model,
        max_tokens: maxTokens,
        temperature: 0,
        messages,
        response_format: format,
        // A router picks an upstream host for you, and they don't all support
        // schema-constrained output. This says: only use one that does, rather
        // than silently landing on one that ignores the schema.
        ...(route.provider === "openrouter" && format.type === "json_schema"
          ? { provider: { require_parameters: true } }
          : {}),
      }),
    });
    if (!response.ok) {
      throw new Error(`${route.provider} said ${response.status}: ${await response.text()}`);
    }
    return (await response.json()) as {
      choices: { message: { content: string } }[];
      usage?: { prompt_tokens: number; completion_tokens: number };
    };
  };

  let body;
  try {
    body = await ask({
      type: "json_schema",
      json_schema: { name: call.schemaName, strict: true, schema: jsonSchema },
    });
  } catch (error) {
    // Providers that reject strict schemas still honour plain JSON mode.
    if (!/schema|strict|response_format/i.test(String(error))) throw error;
    messages[0] = {
      role: "system",
      content: `${call.system}\n\nReply with JSON matching this schema exactly, and nothing else:\n${JSON.stringify(jsonSchema)}`,
    };
    body = await ask({ type: "json_object" });
  }

  const raw = body.choices?.[0]?.message?.content ?? "";
  let parsed = call.schema.safeParse(harvestJson(raw));

  if (!parsed.success) {
    messages.push({ role: "assistant", content: raw });
    messages.push({
      role: "user",
      content: `That did not match the schema: ${parsed.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .slice(0, 10)
        .join("; ")}. Reply again with corrected JSON only.`,
    });
    const retry = await ask({ type: "json_object" });
    parsed = call.schema.safeParse(harvestJson(retry.choices?.[0]?.message?.content ?? ""));
    if (!parsed.success) {
      throw new Error(
        `${route.provider}/${route.model} could not produce valid ${call.schemaName}: ${parsed.error.issues[0]?.message}`,
      );
    }
    body = retry;
  }

  return {
    value: parsed.data,
    route,
    usage: body.usage
      ? { input: body.usage.prompt_tokens, output: body.usage.completion_tokens }
      : undefined,
  };
}

/** Smaller models like to wrap JSON in prose or a fenced block. */
function harvestJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function mediaTypeOf(dataUrl: string): "image/jpeg" | "image/png" | "image/webp" | "image/gif" {
  const match = dataUrl.match(/^data:(image\/(jpeg|png|webp|gif))/);
  return (match?.[1] as "image/jpeg") ?? "image/jpeg";
}
