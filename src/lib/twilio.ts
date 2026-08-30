import "server-only";
import crypto from "node:crypto";

/**
 * Twilio as an alternative front door to the same handler.
 *
 * Every legitimate WhatsApp API runs on Meta's infrastructure in the end — what
 * a provider like this buys you is not having to deal with Meta's developer
 * platform yourself. Their sandbox in particular needs no Meta account at all:
 * each person texts a join code to a shared number once and it works.
 */
export const twilioConfigured = () =>
  Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_WHATSAPP_FROM,
  );

/**
 * Twilio signs the request with the exact URL it called plus every POST field,
 * sorted by name and concatenated. HMAC-SHA1 is their scheme, not a choice.
 *
 * The URL has to be the public one. Behind Vercel's proxy the request's own
 * host header is right, but a rewrite or a custom domain can change it, so
 * TWILIO_WEBHOOK_URL overrides when the two disagree.
 */
export function verifyTwilioSignature(
  url: string,
  params: Record<string, string>,
  header: string | null,
): boolean {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token || !header) return false;

  const payload =
    url +
    Object.keys(params)
      .sort()
      .map((key) => key + params[key])
      .join("");

  const expected = crypto.createHmac("sha1", token).update(payload, "utf8").digest("base64");

  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** "whatsapp:+15551234567" is how Twilio addresses everything. */
export const stripChannel = (address: string) => address.replace(/^whatsapp:/, "");

export async function sendTwilioMessage(to: string, text: string): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;
  if (!sid || !token || !from) throw new Error("Twilio is not configured.");

  const body = new URLSearchParams({
    From: from.startsWith("whatsapp:") ? from : `whatsapp:${from}`,
    To: to.startsWith("whatsapp:") ? to : `whatsapp:${to}`,
    Body: text.slice(0, 1500),
  });

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    },
  );

  if (!response.ok) {
    throw new Error(`Twilio send failed: ${response.status} ${await response.text()}`);
  }
}
