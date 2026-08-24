"use client";

import { useState } from "react";

export default function InviteCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="card flex items-center gap-3 p-4">
      <div className="min-w-0 flex-1">
        <p className="label mb-0.5">Invite code</p>
        <p className="nums text-xl font-bold tracking-[0.3em]">{code}</p>
      </div>
      <button
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          } catch {
            setCopied(false);
          }
        }}
        className="btn-ghost"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
