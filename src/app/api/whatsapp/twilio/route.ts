import { after } from "next/server";
import { sql } from "@/lib/db";
import { handleMessage } from "@/lib/whatsapp-handler";
import {
  sendTwilioMessage,
  stripChannel,
  twilioConfigured,
  verifyTwilioSignature,
} from "@/lib/twilio";

export const maxDuration = 60;

/**
 * The same conversation, arriving from Twilio instead of Meta directly.
 *
 * Only the envelope differs — form fields rather than JSON, an SHA-1 signature
 * over the URL rather than SHA-256 over the body — so this unwraps it and
 * hands the same (phone, text) to the same handler.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  const params = Object.fromEntries(new URLSearchParams(raw));

  // Twilio signs the public URL it called. Behind a proxy the request's own
  // host is usually right, but a custom domain can differ, so allow an override.
  const url =
    process.env.TWILIO_WEBHOOK_URL ??
    (() => {
      const forwarded = request.headers.get("x-forwarded-host");
      const proto = request.headers.get("x-forwarded-proto") ?? "https";
      const here = new URL(request.url);
      return forwarded ? `${proto}://${forwarded}${here.pathname}` : request.url;
    })();

  if (!verifyTwilioSignature(url, params, request.headers.get("x-twilio-signature"))) {
    return new Response("Bad signature", { status: 401 });
  }

  const from = params.From ? stripChannel(params.From) : null;
  const text = params.Body ?? "";
  const messageId = params.MessageSid ?? params.SmsMessageSid ?? null;

  // Answer immediately with empty TwiML: reading a message takes about ten
  // seconds, and Twilio times the webhook out well before that.
  const ack = new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });

  if (!from || !text.trim() || !messageId || !twilioConfigured()) return ack;

  after(async () => {
    const fresh = await sql<{ id: string }>`
      insert into whatsapp_seen (message_id) values (${messageId})
      on conflict (message_id) do nothing
      returning message_id as id
    `;
    if (fresh.length === 0) return;

    try {
      const reply = await handleMessage(from, text);
      if (reply) await sendTwilioMessage(from, reply);
    } catch (error) {
      console.error("twilio handler failed", error);
      try {
        await sendTwilioMessage(from, "Something went wrong at my end. Try that again in a minute.");
      } catch {
        // The send is what failed; nothing further to try.
      }
    }
  });

  return ack;
}
