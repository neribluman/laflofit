import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { sqlOne } from "@/lib/db";
import { currentUser } from "@/lib/data";

/**
 * Serves one person's photo. Crew-scoped: you can see the people you are in a
 * crew with, and nobody else — the same rule as every other read in the app.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await currentUser();
  if (!me) return new NextResponse(null, { status: 401 });

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse(null, { status: 400 });

  const row = await sqlOne<{ avatar: string | null }>`
    select avatar from users where id = ${id} and crew_id = ${me.crew_id}
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
