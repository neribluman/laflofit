import { currentUser } from "@/lib/data";
import { exportFor, type Format } from "@/lib/export";

/** A long history is a lot of rows to assemble, though not a lot of bytes. */
export const maxDuration = 60;

const FORMATS: Format[] = ["days", "items", "json"];

/**
 * Your own history, as a file.
 *
 * Session-scoped and takes no user id: there is no parameter here that could
 * be edited to fetch somebody else's diary.
 */
export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return new Response("Not signed in", { status: 401 });

  const asked = new URL(request.url).searchParams.get("format");
  const format = FORMATS.includes(asked as Format) ? (asked as Format) : "days";

  const file = await exportFor(user, format);

  return new Response(file.body, {
    headers: {
      "Content-Type": file.type,
      "Content-Disposition": `attachment; filename="${file.filename}"`,
      // Someone's diary should not sit in a CDN or a browser cache.
      "Cache-Control": "no-store, private",
    },
  });
}
