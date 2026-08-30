"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { currentUser } from "@/lib/data";
import { issueLinkCode } from "@/lib/whatsapp-handler";

export async function connectCode(): Promise<{ code: string; number: string } | null> {
  const user = await currentUser();
  const number = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER;
  if (!user || !number) return null;
  return { code: await issueLinkCode(user.id), number };
}

export async function disconnectWhatsApp() {
  const user = await currentUser();
  if (!user) return;
  await sql`update users set phone = null where id = ${user.id}`;
  await sql`delete from phone_links where user_id = ${user.id}`;
  revalidatePath("/me");
}
