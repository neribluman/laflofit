"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { logDay, logPlate, logVoice, undoLog, type LogResult, type LogReceipt } from "./actions";
import { shrinkImage } from "@/lib/image";
import type { DayReport } from "@/lib/interpret";
import { macroTotals } from "@/lib/macros";
import { describeExercise } from "@/lib/exercise-format";

const EXAMPLE =
  "Two eggs and black coffee at 7, chicken caesar for lunch, beans and steak for dinner. Caved and had a slice of bread. 3L water. Squats 5x5 at 100kg then bench 3x8 at 70. 84.1kg this morning.";

type Saved = {
  report: DayReport;
  labels: Record<string, string>;
  receipt: LogReceipt;
  /** What the transcriber heard, when this came in by voice. */
  heard?: string;
};

/** Whatever this browser will actually give us; Safari and Chrome differ. */
function pickAudioType(): string {
  for (const type of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"]) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return "";
}

export default function NaturalLog({
  date,
  weightUnit,
  distanceUnit,
  prominent = false,
  fallbackHref,
  canSpeak = false,
}: {
  date: string;
  weightUnit: string;
  distanceUnit: string;
  /** On an untouched day this box is the whole screen, so give it room. */
  prominent?: boolean;
  /** Shown under the box while composing, and hidden once there's a result. */
  fallbackHref?: string;
  /** Whether a transcription key is configured on the server. */
  canSpeak?: boolean;
}) {
  const [text, setText] = useState("");
  const [saved, setSaved] = useState<Saved | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [undone, setUndone] = useState(false);
  const [working, startWorking] = useTransition();
  const [undoing, startUndoing] = useTransition();
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);

  // Releasing the microphone matters: the browser shows a recording indicator
  // for as long as the track is live, and leaving one on after navigating away
  // looks exactly like an app listening to you.
  useEffect(() => {
    return () => {
      recorder.current?.stream.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    if (!recording) return;
    const tick = setInterval(() => setSeconds((n) => n + 1), 1000);
    return () => clearInterval(tick);
  }, [recording]);

  const handle = (result: LogResult & { heard?: string }, spentText: boolean) => {
    if (result.ok) {
      setSaved({
        report: result.report,
        labels: result.labels,
        receipt: result.receipt,
        heard: result.heard,
      });
      setError(null);
      setUndone(false);
      if (spentText) setText("");
    } else {
      setError(result.error);
    }
  };

  // One press. It used to read the text, show a proposal, and wait for a
  // second press to save — and people took the proposal for the result and
  // walked away, losing the lot.
  const log = () =>
    startWorking(async () => {
      setError(null);
      try {
        handle(await logDay(date, text), true);
      } catch {
        setError("That didn't get through — your text is still here, try again.");
      }
    });

  const logPhoto = (file: File | undefined) => {
    if (!file) return;
    startWorking(async () => {
      setError(null);
      try {
        handle(await logPlate(date, await shrinkImage(file)), false);
      } catch {
        setError("Couldn't read that image. Try another.");
      }
    });
  };

  const startRecording = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = pickAudioType();
      const media = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      const chunks: Blob[] = [];

      media.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      media.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunks, { type: media.mimeType || "audio/webm" });
        setRecording(false);
        setSeconds(0);
        if (blob.size < 1200) {
          setError("That was too short to hear. Hold it while you talk.");
          return;
        }
        startWorking(async () => {
          try {
            const reader = new FileReader();
            const base64 = await new Promise<string>((resolve, reject) => {
              reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
              reader.onerror = () => reject(reader.error);
              reader.readAsDataURL(blob);
            });
            handle(await logVoice(date, base64, blob.type), false);
          } catch {
            setError("Couldn't send that recording. Try again.");
          }
        });
      };

      recorder.current = media;
      media.start();
      setSeconds(0);
      setRecording(true);
    } catch {
      setError("I can't reach the microphone. Check the permission for this site.");
    }
  };

  const stopRecording = () => recorder.current?.stop();

  const undo = () => {
    if (!saved) return;
    startUndoing(async () => {
      try {
        await undoLog(saved.receipt);
        setUndone(true);
        setSaved(null);
      } catch {
        setError("Couldn't undo that. Delete the items below instead.");
      }
    });
  };

  return (
    <div className="card p-4">
      {saved && (
        <div className="mb-3 rounded-xl border border-accent/40 bg-accent/5 p-3">
          <div className="flex items-baseline gap-2">
            <p className="flex-1 text-sm font-semibold">
              <span aria-hidden>✓</span> Logged
            </p>
            <button
              onClick={undo}
              disabled={undoing}
              className="btn-quiet shrink-0 px-2 py-1 text-xs"
            >
              {undoing ? "Undoing…" : "Undo"}
            </button>
          </div>
          {saved.heard && (
            <p className="mt-2 text-xs text-muted">
              Heard: <span className="italic">&ldquo;{saved.heard}&rdquo;</span>
            </p>
          )}
          <Summary
            report={saved.report}
            labels={saved.labels}
            weightUnit={weightUnit}
            distanceUnit={distanceUnit}
          />
          <p className="mt-2 text-xs text-muted">
            It&apos;s in your day below — change or delete anything there.
          </p>
        </div>
      )}

      {undone && !saved && (
        <p
          aria-live="polite"
          className="mb-3 rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm text-muted"
        >
          Undone. Nothing was kept.
        </p>
      )}

      <label className="label" htmlFor="day-text">
        Just tell me about your day
      </label>
      <textarea
        id="day-text"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (saved) setSaved(null);
          if (undone) setUndone(false);
        }}
        onKeyDown={(e) => {
          // Enter alone has to stay a newline — people write several lines in
          // here. Cmd/Ctrl+Enter is the send that every message box has.
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            if (!working && text.trim().length >= 3) log();
          }
        }}
        rows={prominent ? 6 : 3}
        maxLength={2000}
        placeholder={EXAMPLE}
        className={`field resize-none ${prominent ? "text-base leading-relaxed" : ""}`}
      />

      {working && (
        <div className="mt-3 space-y-2" aria-live="polite">
          <p className="text-sm text-muted">
            {recording ? "Listening…" : "Reading it and adding it…"}
          </p>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-3 animate-pulse rounded bg-surface-2"
              style={{ width: `${[92, 74, 58][i]}%`, animationDelay: `${i * 140}ms` }}
            />
          ))}
        </div>
      )}

      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={log}
          disabled={working || text.trim().length < 3}
          className="btn-primary flex-1"
        >
          {working ? "Adding…" : "Add to my day"}
        </button>
        {canSpeak && (
          <button
            type="button"
            onClick={recording ? stopRecording : startRecording}
            disabled={working}
            aria-label={recording ? "Stop recording" : "Say it instead"}
            title={recording ? "Stop and log it" : "Say it instead"}
            className={`shrink-0 px-3 ${recording ? "btn-primary" : "btn-ghost"}`}
          >
            {recording ? (
              <span className="nums flex items-center gap-1.5 text-sm font-semibold">
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 animate-pulse rounded-full bg-current"
                />
                {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
              </span>
            ) : (
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="9" y="3" width="6" height="11" rx="3" />
                <path d="M5 11a7 7 0 0014 0M12 18v3" />
              </svg>
            )}
          </button>
        )}

        <label
          aria-label="Photograph your plate"
          title="Photograph your plate"
          className="btn-ghost shrink-0 cursor-pointer px-3"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 8.5A1.5 1.5 0 014.5 7h2L8 5h8l1.5 2h2A1.5 1.5 0 0121 8.5v9A1.5 1.5 0 0119.5 19h-15A1.5 1.5 0 013 17.5z" />
            <circle cx="12" cy="13" r="3.2" />
          </svg>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            disabled={working}
            onChange={(e) => {
              logPhoto(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
      </div>

      <p className="mt-2 text-center text-xs text-muted">
        Food, training, weight, how it went — all of it, in one go. Or
        photograph your plate.{" "}
        <span className="whitespace-nowrap">
          <kbd className="rounded border border-line px-1 py-px text-[10px]">⌘</kbd>
          <span aria-hidden>/</span>
          <kbd className="rounded border border-line px-1 py-px text-[10px]">Ctrl</kbd>
          {" + "}
          <kbd className="rounded border border-line px-1 py-px text-[10px]">↵</kbd>{" "}
          adds it.
        </span>
      </p>

      {fallbackHref && !saved && (
        <p className="mt-3 text-center text-sm text-muted">
          Or{" "}
          <Link href={fallbackHref} className="font-medium text-accent">
            fill it in yourself
          </Link>{" "}
          instead.
        </p>
      )}

      {error && (
        <p aria-live="polite" className="mt-3 text-sm text-bad">
          {error}
        </p>
      )}
    </div>
  );
}

/** What just went in. A receipt, not a decision — it is already saved. */
function Summary({
  report,
  labels,
  weightUnit,
  distanceUnit,
}: {
  report: DayReport;
  labels: Record<string, string>;
  weightUnit: string;
  distanceUnit: string;
}) {
  const totals = macroTotals(report.meals);

  return (
    <div className="mt-2">
      {report.meals.length > 0 && (
        <div className="mb-2">
          <div className="flex items-baseline gap-2">
            <span className="nums text-lg font-bold leading-none">
              {totals.calories.toLocaleString()}
            </span>
            <span className="text-xs text-muted">kcal</span>
            <span className="nums ml-auto text-xs text-muted">
              P {totals.protein} · C {totals.carbs} · F {totals.fat}
            </span>
          </div>
          <ul className="mt-1 space-y-0.5">
            {report.meals.map((meal, i) => (
              <li key={`m${i}`} className="flex gap-2 text-xs text-muted">
                <span className="min-w-0 flex-1 truncate">{meal.description}</span>
                <span className="nums shrink-0">
                  {meal.calories != null ? `${Math.round(meal.calories)}` : "—"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ul className="space-y-1">
        {report.rules.map((entry) => (
          <li key={entry.rule_id} className="flex items-start gap-2 text-xs">
            <span aria-hidden className={entry.met === false ? "text-bad" : "text-accent"}>
              {entry.value != null ? "•" : entry.met ? "✓" : "✗"}
            </span>
            <span className="min-w-0 flex-1 text-muted">
              {labels[entry.rule_id]}
              {entry.value != null && (
                <span className="nums font-semibold text-text"> — {entry.value}</span>
              )}
            </span>
          </li>
        ))}

        {report.workouts.map((workout, i) => (
          <li key={`w${i}`} className="flex items-start gap-2 text-xs">
            <span aria-hidden className="text-cool">▲</span>
            <span className="min-w-0 flex-1">
              {workout.kind}
              {workout.minutes ? `, ${workout.minutes} min` : ""} · {workout.intensity}
              {workout.exercises?.length > 0 && (
                <span className="mt-0.5 block">
                  {workout.exercises.map((exercise, j) => (
                    <span key={`e${j}`} className="flex gap-2 text-muted">
                      <span className="min-w-0 flex-1 truncate">{exercise.name}</span>
                      <span className="nums shrink-0">
                        {describeExercise(exercise, weightUnit, distanceUnit) || "—"}
                      </span>
                    </span>
                  ))}
                </span>
              )}
            </span>
          </li>
        ))}

        {report.weight != null && (
          <li className="flex items-start gap-2 text-xs">
            <span aria-hidden className="text-cool">▲</span>
            <span className="nums text-muted">
              Weigh-in: {report.weight} {weightUnit}
            </span>
          </li>
        )}
      </ul>

      {report.unclear.length > 0 && (
        <p className="mt-2 text-xs text-muted">
          Didn&apos;t know what to do with: {report.unclear.join("; ")}.
        </p>
      )}
    </div>
  );
}
