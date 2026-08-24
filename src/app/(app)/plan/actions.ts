"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sql, sqlOne } from "@/lib/db";
import { currentUser } from "@/lib/data";
import type { User } from "@/lib/types";

async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

/** You may edit your own plans and your crew's shared ones — nobody else's. */
async function assertCanEditPlan(user: User, planId: string) {
  const row = await sqlOne`
    select 1 from plans
    where id = ${planId}
      and (owner_id = ${user.id} or crew_id = ${user.crew_id})
  `;
  if (!row) throw new Error("That plan isn't yours to edit.");
}

const asNumber = (v: FormDataEntryValue | null) => {
  const raw = String(v ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};

const clampPoints = (v: FormDataEntryValue | null) =>
  Math.max(0, Math.min(5, Math.round(asNumber(v) ?? 1)));

export async function addRule(formData: FormData) {
  const user = await requireUser();
  const planId = String(formData.get("plan_id"));
  await assertCanEditPlan(user, planId);

  const label = String(formData.get("label") ?? "").trim();
  if (!label) return;

  const next = await sqlOne<{ next: number }>`
    select coalesce(max(sort_order) + 1, 0)::int as next
    from plan_rules where plan_id = ${planId}
  `;

  await sql`
    insert into plan_rules
      (plan_id, label, kind, unit, target, cadence, points, sort_order)
    values (
      ${planId},
      ${label.slice(0, 120)},
      ${String(formData.get("kind") ?? "do")},
      ${String(formData.get("unit") ?? "").trim().slice(0, 12) || null},
      ${asNumber(formData.get("target"))},
      ${formData.get("cadence") === "weekly" ? "weekly" : "daily"},
      ${clampPoints(formData.get("points"))},
      ${next?.next ?? 0}
    )
  `;

  revalidatePath("/plan");
  revalidatePath("/today");
}

export async function updateRule(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id"));
  const label = String(formData.get("label") ?? "").trim();
  if (!label) return;

  const owning = await sqlOne<{ plan_id: string }>`
    select plan_id from plan_rules where id = ${id}
  `;
  if (!owning) return;
  await assertCanEditPlan(user, owning.plan_id);

  await sql`
    update plan_rules set
      label   = ${label.slice(0, 120)},
      kind    = ${String(formData.get("kind") ?? "do")},
      unit    = ${String(formData.get("unit") ?? "").trim().slice(0, 12) || null},
      target  = ${asNumber(formData.get("target"))},
      cadence = ${formData.get("cadence") === "weekly" ? "weekly" : "daily"},
      points  = ${clampPoints(formData.get("points"))}
    where id = ${id}
  `;

  revalidatePath("/plan");
  revalidatePath("/today");
}

export async function deleteRule(id: string) {
  const user = await requireUser();
  const owning = await sqlOne<{ plan_id: string }>`
    select plan_id from plan_rules where id = ${id}
  `;
  if (!owning) return;
  await assertCanEditPlan(user, owning.plan_id);

  await sql`delete from plan_rules where id = ${id}`;
  revalidatePath("/plan");
  revalidatePath("/today");
}

export async function renamePlan(formData: FormData) {
  const user = await requireUser();
  const planId = String(formData.get("plan_id"));
  await assertCanEditPlan(user, planId);

  await sql`
    update plans
    set name = ${String(formData.get("name") ?? "").trim().slice(0, 60) || "My plan"}
    where id = ${planId}
  `;
  revalidatePath("/plan");
  revalidatePath("/today");
}

export async function switchPlan(planId: string) {
  const user = await requireUser();

  // Only onto a plan your crew can actually see.
  const visible = await sqlOne`
    select 1 from plans p
    left join users u on u.id = p.owner_id
    where p.id = ${planId}
      and (p.crew_id = ${user.crew_id} or u.crew_id = ${user.crew_id})
  `;
  if (!visible) throw new Error("That plan isn't available to your crew.");

  await sql`update users set active_plan_id = ${planId} where id = ${user.id}`;
  revalidatePath("/", "layout");
  redirect("/today");
}

/** Plain-form wrapper around the onboarding preset action. */
export async function startPreset(formData: FormData) {
  const { choosePlan } = await import("@/app/onboarding/actions");
  await choosePlan({}, formData);
}
