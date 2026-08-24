"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { sql, sqlOne } from "@/lib/db";
import { currentUser, measurementsFor } from "@/lib/data";
import { getPreset } from "@/lib/presets";
import { interpretPlanRequest, type PlanDraft } from "@/lib/interpret";
import { describePerson } from "@/lib/profile";
import { todayIn } from "@/lib/dates";

export type FormState = { error?: string };

export async function choosePlan(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await currentUser();
  if (!user) redirect("/login");

  const preset = getPreset(String(formData.get("preset") ?? ""));
  if (!preset) return { error: "Pick a plan to get started." };

  const shared = formData.get("scope") !== "me";

  const plan = await sqlOne<{ id: string }>`
    insert into plans (crew_id, owner_id, name, description)
    values (
      ${shared ? user.crew_id : null},
      ${user.id},
      ${preset.name},
      ${preset.blurb}
    )
    returning id
  `;
  if (!plan) return { error: "Could not create the plan." };

  for (const [i, rule] of preset.rules.entries()) {
    await sql`
      insert into plan_rules
        (plan_id, label, kind, unit, target, cadence, points, sort_order)
      values (
        ${plan.id}, ${rule.label}, ${rule.kind}, ${rule.unit ?? null},
        ${rule.target ?? null}, ${rule.cadence ?? "daily"},
        ${rule.points ?? 1}, ${i}
      )
    `;
  }

  await sql`update users set active_plan_id = ${plan.id} where id = ${user.id}`;

  revalidatePath("/", "layout");
  redirect("/today");
}

/** Adopt a plan a crewmate already built, rather than making a duplicate. */
export async function adoptPlan(planId: string) {
  const user = await currentUser();
  if (!user) redirect("/login");

  await sql`update users set active_plan_id = ${planId} where id = ${user.id}`;
  revalidatePath("/", "layout");
  redirect("/today");
}

export type DraftResult =
  | { ok: true; draft: PlanDraft }
  | { ok: false; error: string };

/** Turn a description of a goal into a proposed plan. Writes nothing. */
export async function draftPlan(text: string): Promise<DraftResult> {
  const user = await currentUser();
  if (!user) redirect("/login");

  const trimmed = text.trim();
  if (trimmed.length < 8) {
    return { ok: false, error: "Tell me a bit more about what you're after." };
  }

  const weighIns = await measurementsFor([user.id]);
  const latestWeight =
    [...weighIns].reverse().find((m) => m.weight_kg != null)?.weight_kg ?? null;

  try {
    return {
      ok: true,
      draft: await interpretPlanRequest({
        text: trimmed.slice(0, 1500),
        units: user.units,
        person: describePerson(user, latestWeight, todayIn(user.timezone)),
      }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Something went wrong.";
    return {
      ok: false,
      error:
        message.includes("api_key") || message.includes("authentication")
          ? "The Claude API key isn't set up. See the README."
          : message,
    };
  }
}

/** Create the plan the user just approved. */
export async function createPlanFromDraft(draft: PlanDraft, shared: boolean) {
  const user = await currentUser();
  if (!user) redirect("/login");

  const plan = await sqlOne<{ id: string }>`
    insert into plans (crew_id, owner_id, name, description)
    values (
      ${shared ? user.crew_id : null},
      ${user.id},
      ${draft.name.trim().slice(0, 60) || "My plan"},
      ${draft.description?.trim().slice(0, 300) || null}
    )
    returning id
  `;
  if (!plan) return;

  for (const [i, rule] of draft.rules.slice(0, 12).entries()) {
    if (!rule.label?.trim()) continue;

    // A count rule with no target can never be satisfied — scoring needs a
    // number to compare against. Treat it as the tick it actually is.
    const kind =
      rule.kind === "count" && rule.target == null
        ? "do"
        : ["do", "avoid", "count"].includes(rule.kind)
          ? rule.kind
          : "do";
    await sql`
      insert into plan_rules
        (plan_id, label, kind, unit, target, cadence, points, sort_order)
      values (
        ${plan.id},
        ${rule.label.trim().slice(0, 120)},
        ${kind},
        ${kind === "count" ? (rule.unit?.trim().slice(0, 12) || null) : null},
        ${kind === "count" ? rule.target : null},
        ${rule.cadence === "weekly" ? "weekly" : "daily"},
        ${Math.max(0, Math.min(5, Math.round(rule.points ?? 1)))},
        ${i}
      )
    `;
  }

  await sql`update users set active_plan_id = ${plan.id} where id = ${user.id}`;
  revalidatePath("/", "layout");
  redirect("/today");
}
