import "server-only";
import crypto from "node:crypto";

/**
 * The Cloud API, kept to the two calls this app makes: verify that a webhook
 * really came from Meta, and send a reply.
 *
 * Graph's version is pinned in an env var because Meta retires versions on a
 * schedule and a hard-coded one turns into an outage nobody is watching for.
 */
const GRAPH = process.env.WHATSAPP_GRAPH_VERSION ?? "v21.0";

export const whatsappConfigured = () =>
  Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);

/**
 * Meta signs every webhook body with the app secret. Without this check the
 * endpoint is a public URL that will write to anyone's diary on request, so
 * an unverified payload is dropped rather than parsed.
 *
 * timingSafeEqual, because comparing signatures with === leaks how much of the
 * guess was right.
 */
export function verifySignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !header?.startsWith("sha256=")) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");
  const given = header.slice("sha256=".length);

  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(given, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export type Incoming = {
  from: string;
  text: string;
  messageId: string;
};

/** Pull the plain-text messages out of a webhook body, ignoring everything else. */
export function incomingMessages(body: unknown): Incoming[] {
  const out: Incoming[] = [];
  const entries = (body as { entry?: unknown[] })?.entry ?? [];

  for (const entry of entries) {
    for (const change of (entry as { changes?: unknown[] })?.changes ?? []) {
      const value = (change as { value?: Record<string, unknown> })?.value;
      for (const message of (value?.messages as unknown[]) ?? []) {
        const m = message as {
          from?: string;
          id?: string;
          type?: string;
          text?: { body?: string };
        };
        // Statuses, reactions, images and the rest arrive here too; this app
        // only has something to say about text.
        if (m.type !== "text" || !m.from || !m.id || !m.text?.body) continue;
        out.push({ from: m.from, text: m.text.body, messageId: m.id });
      }
    }
  }
  return out;
}

export async function sendMessage(to: string, text: string): Promise<void> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) throw new Error("WhatsApp is not configured.");

  const response = await fetch(`https://graph.facebook.com/${GRAPH}/${phoneId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      // 4096 is the limit; anything longer is rejected outright rather than cut.
      text: { body: text.slice(0, 4000), preview_url: false },
    }),
  });

  if (!response.ok) {
    throw new Error(`WhatsApp send failed: ${response.status} ${await response.text()}`);
  }
}
