"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { weeklyRecap } from "./recap-actions";

export default function WeeklyRecap() {
  const [message, setMessage] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [working, start] = useTransition();
  const closeRef = useRef<HTMLButtonElement>(null);

  // A dialog you can't dismiss with the key everyone reaches for is a trap.
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const write = () =>
    start(async () => {
      setError(null);
      setCopied(false);
      try {
        const result = await weeklyRecap();
        if (!result) {
          setError("Couldn't write it just now. Try again in a minute.");
          return;
        }
        setMessage(result.message);
        setOpen(true);
      } catch {
        setError("Couldn't write it just now. Try again in a minute.");
      }
    });

  const copy = async () => {
    if (!message) return;
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard access can be refused outright; the text is on screen and
      // selectable, so say so rather than pretending it worked.
      setError("Couldn't copy — select the text and copy it by hand.");
    }
  };

  return (
    <>
      <button
        onClick={write}
        disabled={working}
        className="btn-quiet w-full text-sm"
      >
        {working ? "Writing the week up…" : "📋 Write up the week for WhatsApp"}
      </button>

      {error && !open && (
        <p aria-live="polite" className="mt-2 text-center text-xs text-bad">
          {error}
        </p>
      )}

      {open && message && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="This week, written up"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="card max-h-[85vh] w-full max-w-md overflow-y-auto rounded-b-none p-4 sm:rounded-b-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-baseline gap-2">
              <h2 className="flex-1 text-sm font-semibold">This week, written up</h2>
              <button
                ref={closeRef}
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="btn-quiet px-2 py-1 text-xs"
              >
                Close
              </button>
            </div>

            {/* A textarea rather than a <pre>: it selects properly on a phone,
                which matters when the clipboard button is refused. */}
            <textarea
              readOnly
              value={message}
              rows={Math.min(20, message.split("\n").length + 1)}
              onFocus={(e) => e.currentTarget.select()}
              className="field w-full resize-none font-mono text-xs leading-relaxed"
            />

            <div className="mt-3 flex gap-2">
              <button onClick={copy} className="btn-primary flex-1">
                {copied ? "Copied ✓" : "Copy"}
              </button>
              <button onClick={write} disabled={working} className="btn-quiet px-3">
                {working ? "…" : "Rewrite"}
              </button>
            </div>

            {error && (
              <p aria-live="polite" className="mt-2 text-xs text-bad">
                {error}
              </p>
            )}

            <p className="mt-3 text-xs text-muted">
              The asterisks are WhatsApp&apos;s own bold — they turn into bold
              text once pasted, not into stars.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
