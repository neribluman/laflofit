"use client";

import { useState } from "react";

/**
 * The link is the thing people share; the code is just what makes it work.
 * Nobody should have to read six characters down a phone.
 */
export default function InviteCode({
  code,
  crewName,
}: {
  code: string;
  crewName: string;
}) {
  const [copied, setCopied] = useState(false);
  const [showCode, setShowCode] = useState(false);

  const link = () => {
    const base = process.env.NEXT_PUBLIC_BASE_PATH || "";
    return `${window.location.origin}${base}/join/${code}`;
  };

  const share = async () => {
    const url = link();
    const text = `Join ${crewName} on LaFloFit`;

    // The native sheet on a phone: straight into whichever chat they use.
    if (navigator.share) {
      try {
        await navigator.share({ title: text, text, url });
        return;
      } catch {
        // Dismissed the sheet — fall through to copying.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setShowCode(true);
    }
  };

  return (
    <div className="card p-4">
      <button onClick={share} className="btn-primary w-full">
        {copied ? "Link copied" : `Invite someone to ${crewName}`}
      </button>
      <p className="mt-2 text-center text-xs text-muted">
        Sends a link. They tap it, pick a name and a PIN, and they&apos;re in.
      </p>

      <button
        onClick={() => setShowCode((v) => !v)}
        className="btn-quiet mt-1 w-full text-xs"
        aria-expanded={showCode}
      >
        {showCode ? "Hide the code" : "Or read out a code instead"}
      </button>

      {showCode && (
        <p className="nums mt-1 text-center text-xl font-bold tracking-[0.3em]">
          {code}
        </p>
      )}
    </div>
  );
}
