"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { sql, sqlOne } from "@/lib/db";
import { currentUser } from "@/lib/data";
import { getPreset } from "@/lib/presets";

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
      ${preset.key === "blank" ? "My plan" : preset.name},
      ${preset.key === "blank" ? null : preset.blurb}
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
  redirect(preset.key === "blank" ? "/plan" : "/today");
}

/** Adopt a plan a crewmate already built, rather than making a duplicate. */
export async function adoptPlan(planId: string) {
  const user = await currentUser();
  if (!user) redirect("/login");

  await sql`update users set active_plan_id = ${planId} where id = ${user.id}`;
  revalidatePath("/", "layout");
  redirect("/today");
}
