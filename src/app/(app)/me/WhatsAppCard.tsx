"use client";

import { useState, useTransition } from "react";
import { connectCode, disconnectWhatsApp } from "./whatsapp-actions";

export default function WhatsAppCard({ connected }: { connected: boolean }) {
  const [link, setLink] = useState<{ code: string; number: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, start] = useTransition();

  const connect = () =>
    start(async () => {
      setError(null);
      const result = await connectCode();
      if (result) setLink(result);
      else setError("WhatsApp isn't set up for this app yet.");
    });

  if (connected && !link) {
    return (
      <div className="card p-4">
        <p className="text-sm">
          <span aria-hidden>✓</span> Your WhatsApp is connected. Text the bot what you
          ate or trained and it logs it — or ask it how your week is going.
        </p>
        <button
          onClick={() => start(async () => void (await disconnectWhatsApp()))}
          disabled={working}
          className="btn-quiet mt-3 w-full text-sm"
        >
          Disconnect this number
        </button>
      </div>
    );
  }

  return (
    <div className="card p-4">
      {!link ? (
        <>
          <p className="mb-3 text-sm text-muted">
            Log without opening the app: text what you ate or trained and it goes
            straight in. You can ask it things too.
          </p>
          <button onClick={connect} disabled={working} className="btn-primary w-full">
            {working ? "…" : "Connect WhatsApp"}
          </button>
        </>
      ) : (
        <>
          <p className="text-sm">Send this to the bot, and it&apos;ll know it&apos;s you:</p>
          <p className="nums my-3 text-center text-2xl font-bold tracking-[0.2em]">
            LINK {link.code}
          </p>
          <a
            href={`https://wa.me/${link.number.replace(/\D/g, "")}?text=${encodeURIComponent(
              `LINK ${link.code}`,
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary flex w-full items-center justify-center"
          >
            Open WhatsApp with it ready
          </a>
          <p className="mt-3 text-xs text-muted">
            The code works once and expires in fifteen minutes. Texting{" "}
            <span className="font-medium">STOP</span> to the bot disconnects you again.
          </p>
        </>
      )}

      {error && (
        <p aria-live="polite" className="mt-2 text-sm text-bad">
          {error}
        </p>
      )}
    </div>
  );
}
