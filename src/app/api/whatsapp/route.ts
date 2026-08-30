import { after } from "next/server";
import { sql } from "@/lib/db";
import { handleMessage } from "@/lib/whatsapp-handler";
import {
  incomingMessages,
  sendMessage,
  verifySignature,
  whatsappConfigured,
} from "@/lib/whatsapp";

/** Reading a message calls Claude, which takes a while. */
export const maxDuration = 60;

/**
 * Meta's one-time subscription handshake: it calls with a token we chose and
 * expects the challenge echoed back.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;

  if (
    expected &&
    params.get("hub.mode") === "subscribe" &&
    params.get("hub.verify_token") === expected
  ) {
    return new Response(params.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(request: Request) {
  // The raw body, because the signature is over the exact bytes Meta sent.
  const raw = await request.text();

  if (!verifySignature(raw, request.headers.get("x-hub-signature-256"))) {
    return new Response("Bad signature", { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Bad body", { status: 400 });
  }

  const messages = incomingMessages(body);

  // Acknowledge first, work after. Meta retries anything it doesn't hear back
  // from quickly, and a retry here would log someone's dinner twice.
  after(async () => {
    if (!whatsappConfigured()) return;

    for (const message of messages) {
      // Retries arrive with the same message id, so a seen id is a no-op.
      const fresh = await sql<{ id: string }>`
        insert into whatsapp_seen (message_id) values (${message.messageId})
        on conflict (message_id) do nothing
        returning message_id as id
      `;
      if (fresh.length === 0) continue;

      try {
        const reply = await handleMessage(message.from, message.text);
        if (reply) await sendMessage(message.from, reply);
      } catch (error) {
        console.error("whatsapp handler failed", error);
        try {
          await sendMessage(
            message.from,
            "Something went wrong at my end. Try that again in a minute.",
          );
        } catch {
          // Nothing more to do — the send itself is what failed.
        }
      }
    }
  });

  return new Response("ok", { status: 200 });
}
