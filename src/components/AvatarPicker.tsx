"use client";

import { useRef, useState, useTransition } from "react";
import { saveAvatar } from "@/app/(app)/profile-actions";

const SIZE = 256;

/**
 * Takes the photo and shrinks it here rather than uploading whatever the
 * camera produced — a phone photo is several megabytes, and what we need is a
 * 256px square. Cropped from the centre so faces stay put.
 */
async function toSquareDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);

  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Couldn't process that image.");
  context.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    SIZE,
    SIZE,
  );
  bitmap.close();

  return canvas.toDataURL("image/jpeg", 0.82);
}

export default function AvatarPicker({
  initial,
  emoji,
  onSaved,
}: {
  initial?: string | null;
  emoji: string;
  onSaved?: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(initial ?? null);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const handle = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      const dataUrl = await toSquareDataUrl(file);
      setPreview(dataUrl);
      startSaving(async () => {
        const result = await saveAvatar(dataUrl);
        if (result?.error) setError(result.error);
        else onSaved?.();
      });
    } catch {
      setError("Couldn't read that image. Try another one.");
    }
  };

  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="relative rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent"
        aria-label={preview ? "Change your photo" : "Take your photo"}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt=""
            className="h-32 w-32 rounded-full object-cover"
          />
        ) : (
          <span className="flex h-32 w-32 items-center justify-center rounded-full border-2 border-dashed border-line bg-surface-2 text-4xl">
            {emoji}
          </span>
        )}
        <span className="absolute right-0 bottom-0 rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-accent-ink">
          {saving ? "…" : preview ? "Change" : "Take"}
        </span>
      </button>

      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="user"
        className="sr-only"
        onChange={(e) => handle(e.target.files?.[0])}
      />

      {error && <p className="mt-3 text-sm text-bad">{error}</p>}
    </div>
  );
}
