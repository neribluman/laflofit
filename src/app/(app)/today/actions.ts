"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sql, sqlOne } from "@/lib/db";
import { currentUser } from "@/lib/data";
import {
  applyReportFor,
  readDayFor,
  readPlateFor,
  type LogReceipt,
  type LogResult,
  type ReadResult,
} from "@/lib/log";
import type { User } from "@/lib/types";
import { transcribe, transcriberConfigured, VOCABULARY } from "@/lib/transcribe";

export type { LogReceipt, LogResult, ReadResult };

async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Read the text and save it, in one press.
 *
 * There used to be a confirm step between those two, and it lost people's
 * work: the proposal looked like a result, so a real training session sat on
 * screen unsaved until the page was closed. Everything it writes shows up in
 * the day below, where each item already has its own Delete, and the whole
 * submission can be undone from the receipt.
 */
export async function logDay(date: string, text: string): Promise<LogResult> {
  const user = await requireUser();
  const read = await readDayFor(user, date, text);
  if (!read.ok) return read;

  const nothing =
    read.report.meals.length === 0 &&
    read.report.rules.length === 0 &&
    read.report.workouts.length === 0 &&
    read.report.weight == null;
  if (nothing) {
    return {
      ok: false,
      error:
        "Nothing I could work with there. Try naming what you ate, what you trained, or what you weighed.",
    };
  }

  const receipt = await applyReportFor(user, date, read.report);
  if (!receipt) return { ok: false, error: "Couldn't save that. Try again." };

  return { ok: true, report: read.report, labels: read.labels, receipt };
}

/** Same, from a photo of a plate. */
export async function logPlate(
  date: string,
  imageDataUrl: string,
): Promise<LogResult> {
  const user = await requireUser();
  const read = await readPlateFor(user, date, imageDataUrl);
  if (!read.ok) return read;
  if (read.report.meals.length === 0) {
    return { ok: false, error: "Couldn't make out any food there. Try another photo." };
  }

  const receipt = await applyReportFor(user, date, read.report);
  if (!receipt) return { ok: false, error: "Couldn't save that. Try again." };

  return { ok: true, report: read.report, labels: read.labels, receipt };
}

/** Put the day back exactly as it was before that submission. */
export async function undoLog(receipt: LogReceipt) {
  const user = await requireUser();

  if (receipt.mealIds.length > 0) {
    await sql`
      delete from meals
      where user_id = ${user.id} and id = any(${receipt.mealIds}::uuid[])
    `;
  }

  // Exercises cascade with their workout.
  if (receipt.workoutIds.length > 0) {
    await sql`
      delete from workouts
      where user_id = ${user.id} and id = any(${receipt.workoutIds}::uuid[])
    `;
  }

  // Rules were upserts: a row that existed before goes back to its old value,
  // a row this submission created is removed.
  // The receipt comes back through the browser, so the day it names has to be
  // checked against the session before anything is written through it.
  const ownsDay = await sqlOne<{ id: string }>`
    select id from day_logs where id = ${receipt.dayLogId} and user_id = ${user.id}
  `;

  for (const rule of ownsDay ? receipt.rules : []) {
    if (rule.existed) {
      await sql`
        update rule_entries set checked = ${rule.checked}, value = ${rule.value}
        where day_log_id = ${receipt.dayLogId} and rule_id = ${rule.ruleId}
      `;
    } else {
      await sql`
        delete from rule_entries
        where day_log_id = ${receipt.dayLogId} and rule_id = ${rule.ruleId}
      `;
    }
  }

  if (receipt.weight) {
    if (receipt.weight.existed) {
      await sql`
        update measurements set weight_kg = ${receipt.weight.previousKg}
        where user_id = ${user.id} and measured_on = ${receipt.date}::date
      `;
    } else {
      await sql`
        delete from measurements
        where user_id = ${user.id} and measured_on = ${receipt.date}::date
      `;
    }
  }

  if (receipt.noteSet && ownsDay) {
    await sql`
      update day_logs set note = null
      where id = ${receipt.dayLogId} and user_id = ${user.id}
    `;
  }

  revalidatePath("/today");
  revalidatePath("/me");
  revalidatePath("/crew");
}

export type VoiceResult = LogResult & { heard?: string };

/**
 * Say it instead of typing it.
 *
 * The transcript goes through exactly the same path as typed text — there is
 * no separate "voice" understanding, and there shouldn't be. What comes back
 * includes what was heard, because the one new failure here is mishearing, and
 * you can only spot that if you're shown the words.
 */
export async function logVoice(
  date: string,
  audioBase64: string,
  mimeType: string,
): Promise<VoiceResult> {
  await requireUser();
  if (!transcriberConfigured()) {
    return { ok: false, error: "Voice isn't set up for this app yet." };
  }

  // ~10MB of base64 is around 7MB of audio: minutes of speech, far past what
  // anyone dictates into a food log.
  if (audioBase64.length > 10_000_000) {
    return { ok: false, error: "That recording is too long. Try a shorter one." };
  }

  let heard: string;
  try {
    const bytes = Buffer.from(audioBase64, "base64");
    const type = /^audio\/[\w.+-]+$/.test(mimeType) ? mimeType : "audio/webm";
    const extension = type.includes("mp4") || type.includes("mp4a") ? "m4a"
      : type.includes("ogg") ? "ogg"
      : type.includes("wav") ? "wav"
      : "webm";
    heard = await transcribe(new Blob([bytes], { type }), `day.${extension}`, VOCABULARY);
  } catch (error) {
    console.error("transcription failed", error);
    // Telling someone their speech was unclear when the real problem is an
    // expired key or an empty account sends them back to re-record, over and
    // over, fixing something that was never broken.
    const message = String(error);
    const ours = /401|403|invalid.?api.?key|credit|quota|billing|429|5\d\d/i.test(message);
    return {
      ok: false,
      error: ours
        ? "Voice isn't working right now — that's our end, not your recording. Type it for now."
        : "Couldn't make out the audio. Try again, or type it.",
    };
  }

  if (heard.trim().length < 3) {
    return { ok: false, error: "I didn't catch anything. Try again closer to the mic." };
  }

  const result = await logDay(date, heard);
  return { ...result, heard };
}
