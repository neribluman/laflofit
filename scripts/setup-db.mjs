#!/usr/bin/env node
/**
 * One-shot setup: makes sure .env.local has an AUTH_SECRET, then creates every
 * table in db/schema.sql. Safe to run again — it never drops anything.
 *
 *   npm run db:setup
 */
import { readFileSync, writeFileSync, existsSync, appendFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { splitStatements } from "./lib/split-sql.mjs";

const ENV_FILE = ".env.local";
const say = (message) => process.stdout.write(`${message}\n`);
const die = (message) => {
  process.stderr.write(`\n${message}\n\n`);
  process.exit(1);
};

// ---------------------------------------------------------------------------
// 1. Read .env.local
// ---------------------------------------------------------------------------

if (!existsSync(ENV_FILE)) {
  if (existsSync(".env.example")) {
    writeFileSync(ENV_FILE, readFileSync(".env.example", "utf8"));
    say(`Created ${ENV_FILE} from .env.example.`);
  } else {
    die(`No ${ENV_FILE} found, and no .env.example to copy.`);
  }
}

const envText = readFileSync(ENV_FILE, "utf8");
const env = {};
for (const line of envText.split("\n")) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, "");
}

// ---------------------------------------------------------------------------
// 2. Make sure there is a signing secret for login cookies
// ---------------------------------------------------------------------------

if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 16) {
  const secret = randomBytes(32).toString("base64url");
  const needsNewline = envText.length > 0 && !envText.endsWith("\n");
  appendFileSync(
    ENV_FILE,
    `${needsNewline ? "\n" : ""}\n# Signs the login cookie. Generated automatically — keep it secret.\nAUTH_SECRET=${secret}\n`,
  );
  env.AUTH_SECRET = secret;
  say(`Generated a new AUTH_SECRET and saved it to ${ENV_FILE}.`);
}

// ---------------------------------------------------------------------------
// 3. Connect and create the tables
// ---------------------------------------------------------------------------

const url = env.DATABASE_URL ?? env.POSTGRES_URL ?? process.env.DATABASE_URL;

if (!url || url.includes("YOUR-")) {
  die(
    [
      "No database connection string yet.",
      "",
      "  1. Go to vercel.com, open this project, and click the Storage tab.",
      "  2. Create Database -> Neon -> Postgres, and accept the free plan.",
      "  3. Once it is created, open it and copy the connection string",
      "     (it starts with postgresql:// and is quite long).",
      `  4. Paste it into ${ENV_FILE} as:`,
      "",
      "       DATABASE_URL=postgresql://...",
      "",
      "  5. Run `npm run db:setup` again.",
    ].join("\n"),
  );
}

const schema = readFileSync("db/schema.sql", "utf8");
const statements = splitStatements(schema);
const sql = neon(url);

say(`\nCreating tables (${statements.length} statements)…`);

let created = 0;
for (const statement of statements) {
  try {
    await sql.query(statement);
    created += 1;
  } catch (error) {
    die(
      `Failed on this statement:\n\n${statement.slice(0, 400)}\n\n${error.message}`,
    );
  }
}

const [{ count }] = await sql`
  select count(*)::int as count from information_schema.tables
  where table_schema = 'public'
`;

say(`Done — ${created} statements ran, ${count} tables in the database.\n`);
say("Next: npm run dev, then open http://localhost:3000\n");
