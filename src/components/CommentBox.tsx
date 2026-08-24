"use client";

import { useState, useTransition } from "react";
import { postComment } from "@/app/(app)/actions";

export default function CommentBox({
  targetType,
  targetId,
}: {
  targetType: string;
  targetId: string;
}) {
  const [value, setValue] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const text = value.trim();
        if (!text) return;
        setValue("");
        startTransition(async () => {
          await postComment(targetType, targetId, text);
        });
      }}
      className="mt-2 flex gap-2"
    >
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={400}
        placeholder="Say something…"
        aria-label="Add a comment"
        className="field flex-1 py-2 text-sm"
      />
      <button
        className="btn-ghost px-3 py-2 text-sm"
        disabled={pending || !value.trim()}
      >
        Send
      </button>
    </form>
  );
}
