import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { sqlOne } from "@/lib/db";
import { currentUser } from "@/lib/data";

/**
 * Serves one person's photo.
 *
 * Two ways to be allowed: you are signed in and share a crew with them, or you
 * hold that crew's invite code. The code is the trust boundary on the sign-in
 * and invite screens already — it is what lets you see the member list at all
 * — so gating faces more tightly than names would be theatre, and those
 * screens are exactly where a face is most useful.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse(null, { status: 400 });

  const code = new URL(request.url).searchParams.get("code")?.trim().toUpperCase();
  const me = await currentUser();
  if (!me && !code) return new NextResponse(null, { status: 401 });

  const row = me
    ? await sqlOne<{ avatar: string | null }>`
        select avatar from users where id = ${id} and crew_id = ${me.crew_id}
      `
    : await sqlOne<{ avatar: string | null }>`
        select u.avatar from users u
        join crews c on c.id = u.crew_id
        where u.id = ${id} and c.invite_code = ${code}
      `;
  if (!row?.avatar) return new NextResponse(null, { status: 404 });

  const match = row.avatar.match(/^data:(image\/[a-z+]+);base64,(.+)$/);
  if (!match) return new NextResponse(null, { status: 404 });

  const [, mediaType, base64] = match;
  const bytes = Buffer.from(base64, "base64");
  const etag = `"${createHash("sha1").update(bytes).digest("hex").slice(0, 16)}"`;

  if (request.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag } });
  }

  return new NextResponse(bytes, {
    headers: {
      "Content-Type": mediaType,
      "Content-Length": String(bytes.byteLength),
      ETag: etag,
      // Private: these are only ever visible to a signed-in crewmate.
      "Cache-Control": "private, max-age=300, must-revalidate",
    },
  });
}
