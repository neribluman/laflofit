import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let cached: NeonQueryFunction<false, false> | null = null;

/**
 * Connecting a Neon store in Vercel lets you pick a prefix for the variables
 * it creates, so the connection string can arrive under any of these names.
 * Pooled connections come first — that is the right one for serverless.
 */
const URL_VARS = [
  "DATABASE_URL",
  "STORAGE_DATABASE_URL",
  "POSTGRES_URL",
  "STORAGE_POSTGRES_URL",
  "DATABASE_URL_UNPOOLED",
  "STORAGE_POSTGRES_URL_NON_POOLING",
  "POSTGRES_URL_NON_POOLING",
] as const;

function connectionString(): string | undefined {
  for (const name of URL_VARS) {
    const value = process.env[name];
    if (value && value.startsWith("postgres")) return value;
  }
  return undefined;
}

function client() {
  if (!cached) {
    const url = connectionString();
    if (!url) {
      // The fix is completely different depending on where this is running,
      // and telling a deployed app to edit .env.local helps nobody.
      throw new Error(
        process.env.VERCEL
          ? `No Postgres connection string found for this deployment. Looked ` +
            `for: ${URL_VARS.join(", ")}. Add one in Vercel under Settings -> ` +
            `Environment Variables (tick Production), then redeploy — ` +
            `environment variables are baked in at build time, so an existing ` +
            `deployment will not pick up a variable added after it was built.`
          : "DATABASE_URL is not set. Copy .env.example to .env.local and paste " +
            "in your Neon connection string, then run `npm run db:setup`.",
      );
    }
    cached = neon(url);
  }
  return cached;
}

/**
 * Tagged-template query. Values are always sent as bound parameters, never
 * pasted into the SQL, so there is no way to inject through them.
 *
 *   const rows = await sql<User>`select * from users where id = ${id}`
 *
 * Note: Postgres hands back `numeric` as a string and `date` as a Date object,
 * so queries in this project cast them (`::float8`, `::text`) to get plain
 * numbers and YYYY-MM-DD strings out.
 */
export async function sql<T = Record<string, unknown>>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<T[]> {
  return (await client()(strings, ...values)) as T[];
}

/** First row, or null. */
export async function sqlOne<T = Record<string, unknown>>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<T | null> {
  const rows = await sql<T>(strings, ...values);
  return rows[0] ?? null;
}
