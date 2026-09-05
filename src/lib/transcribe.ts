import "server-only";

/**
 * Speech to text.
 *
 * Deliberately not Claude: Anthropic has no transcription API, so this is one
 * job the rest of the app's model harness can't do. It follows the same shape
 * anyway — provider chosen by environment, one function, so swapping is a
 * config change rather than a rewrite.
 *
 * Groq by default. Its whisper-large-v3-turbo runs at roughly 228x real time
 * for $0.04 an hour of audio, which is about a ninth of what the same model
 * costs through OpenAI, and speed matters here because someone is holding
 * their phone waiting.
 */
export type SttProvider = "groq" | "openai" | "deepgram";

const SETTINGS: Record<
  SttProvider,
  { url: string; keyVar: string; defaultModel: string }
> = {
  groq: {
    url: "https://api.groq.com/openai/v1/audio/transcriptions",
    keyVar: "GROQ_API_KEY",
    defaultModel: "whisper-large-v3-turbo",
  },
  openai: {
    url: "https://api.openai.com/v1/audio/transcriptions",
    keyVar: "OPENAI_API_KEY",
    defaultModel: "whisper-1",
  },
  deepgram: {
    url: "https://api.deepgram.com/v1/listen",
    keyVar: "DEEPGRAM_API_KEY",
    defaultModel: "nova-3",
  },
};

export function transcriberConfigured(): boolean {
  return Object.values(SETTINGS).some((s) => Boolean(process.env[s.keyVar]));
}

/** Whichever provider has a key, preferring the one named in STT_PROVIDER. */
function chosen(): { provider: SttProvider; key: string; model: string } | null {
  const named = process.env.STT_PROVIDER?.trim() as SttProvider | undefined;
  const order: SttProvider[] = named && SETTINGS[named]
    ? [named]
    : ["groq", "openai", "deepgram"];

  for (const provider of order) {
    const key = process.env[SETTINGS[provider].keyVar];
    if (key) {
      return {
        provider,
        key,
        model: process.env.STT_MODEL?.trim() || SETTINGS[provider].defaultModel,
      };
    }
  }
  return null;
}

/**
 * Words spoken, given the audio a phone recorded.
 *
 * `hint` is the app's own vocabulary. Every one of these transcribers takes a
 * prompt, and giving it the words it should expect is the difference between
 * "ashtanga" and "ash tonga", or "picanha" and "pick on ya" — proper nouns and
 * gym shorthand are exactly what a general model gets wrong.
 */
export async function transcribe(
  audio: Blob,
  filename: string,
  hint?: string,
): Promise<string> {
  const config = chosen();
  if (!config) throw new Error("No transcription key is configured.");

  const { provider, key, model } = config;

  if (provider === "deepgram") {
    const url = new URL(SETTINGS.deepgram.url);
    url.searchParams.set("model", model);
    url.searchParams.set("smart_format", "true");
    url.searchParams.set("punctuate", "true");
    if (hint) for (const term of hint.split(", ")) url.searchParams.append("keyterm", term);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Token ${key}`,
        "Content-Type": audio.type || "audio/webm",
      },
      body: audio,
    });
    if (!response.ok) {
      throw new Error(`Deepgram said ${response.status}: ${await response.text()}`);
    }
    const body = (await response.json()) as {
      results?: { channels?: { alternatives?: { transcript?: string }[] }[] };
    };
    return body.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() ?? "";
  }

  // Groq and OpenAI share the same multipart shape.
  const form = new FormData();
  form.append("file", audio, filename);
  form.append("model", model);
  form.append("response_format", "text");
  form.append("temperature", "0");
  if (hint) form.append("prompt", hint);

  const response = await fetch(SETTINGS[provider].url, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });

  if (!response.ok) {
    throw new Error(`${provider} said ${response.status}: ${await response.text()}`);
  }
  return (await response.text()).trim();
}

/**
 * The words this app hears more than a general transcriber expects. Kept short
 * on purpose — a prompt this long is context, not a dictionary, and padding it
 * with everything edible makes it worse rather than better.
 */
export const VOCABULARY =
  "Logging a day of food and training. Expect: grams, kcal, protein, carbs, " +
  "reps, sets, kg, lbs, squat, deadlift, bench press, overhead press, barbell " +
  "row, RDL, kettlebell, calisthenics, ashtanga, pilates, HIIT, macros, " +
  "slow-carb, lentils, quinoa, tahini, halloumi, picanha, bresaola, " +
  "mortadella, burrata, skyr, kefir.";
