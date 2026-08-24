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
  onSaved,
}: {
  initial?: string | null;
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
          <img src={preview} alt="" className="h-32 w-32 rounded-full object-cover" />
        ) : (
          <span className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-line bg-surface-2">
            {/* A head and shoulders, so it is obvious what belongs here.
                Sits low and slightly oversized, the way a real portrait
                fills a frame. */}
            <svg
              viewBox="0 0 64 64"
              className="h-full w-full translate-y-1 text-muted/35"
              fill="currentColor"
              aria-hidden
            >
              <circle cx="32" cy="25" r="12" />
              <path d="M10 62c0-12.5 9.8-20 22-20s22 7.5 22 20z" />
            </svg>
          </span>
        )}

        <span className="absolute right-0 bottom-1 flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-accent-ink shadow-sm">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 8.5A1.5 1.5 0 014.5 7h2L8 5h8l1.5 2h2A1.5 1.5 0 0121 8.5v9A1.5 1.5 0 0119.5 19h-15A1.5 1.5 0 013 17.5z" />
            <circle cx="12" cy="13" r="3.2" />
          </svg>
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

      {!preview && (
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="btn-primary mt-5 w-full"
        >
          Take a photo
        </button>
      )}

      {error && <p className="mt-3 text-sm text-bad">{error}</p>}
    </div>
  );
}
