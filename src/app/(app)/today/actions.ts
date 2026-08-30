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
