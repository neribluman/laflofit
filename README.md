# LaFloFit

A small web app for a group of friends to hold each other to a diet and a
training habit. You define the rules, everyone ticks them off daily, and the
crew leaderboard makes it awkward to slack.

Slow-carb is one of the built-in presets, but a "plan" is just a named list of
rules, so it works for any diet.

---

## What it does

| Screen | What's on it |
|---|---|
| **Today** | Your plan's rules as a checklist, a day score, a streak, and the last 7 days at a glance. Tap back through previous days to fill in what you missed. |
| **Me** | Your biomarkers — weight, height, BMI, body fat, waist, resting heart rate, goal, and an estimate of your maintenance calories — with somewhere to add a new reading, the weight trend, your training history, and settings. |
| **About you** | Asked once at sign-up, in the same plain English as everything else: *"34, male, 181cm, about 84kg, desk job but I lift four times a week, trying to get to 78, dodgy knee, vegetarian."* It reads out age, sex, height, weight, goal and activity, and keeps the rest as notes. Every later analysis gets this, so portions are judged against you rather than an average person — and it will tell you when a logged meal contradicts it. Entirely skippable. |
| **Crew** | The tab the app opens on. Seven-day leaderboard, 30-day weight movement, a feed of everything the crew logged with reactions and comments — and a nudge when you're the one who hasn't logged. |
| **Just tell me about your day** | One text box on Today, for the whole day. Write what you ate, what you lifted and how it went in plain English. It logs **every food and drink with estimated calories, protein, carbs, fat and fibre**, reads gym shorthand into **exercises with sets, reps and load**, ticks your plan's rules, and records a weigh-in. Shows you what it understood, and only writes once you confirm. |
| **Macros** | Day totals sit alongside the checklist, with every food and every exercise listed and individually deletable. If your plan has a calorie or protein rule, it fills itself in from the food you logged rather than asking twice. |
| **Undo** | "Reset today" at the bottom of Today wipes that date back to never-logged. It lists exactly what will go — ticks, note, workouts, weigh-in — before it deletes anything. Individual workouts and weigh-ins can also be deleted one at a time from Log. |
| **Plan** | Add, edit and delete rules. Three kinds: *do it*, *avoid it*, *count it* (with a target). Rules can be daily or a once-a-week allowance, which is how the slow-carb cheat day works. |

---

## The stack

- **Next.js on Vercel** — one deploy, free at this size.
- **Neon Postgres, added from inside your Vercel dashboard.** No separate
  account, no second dashboard, nobody else with access. Vercel injects the
  connection string as an environment variable.
- **Sign-in is a crew code, your name, and a 4-digit PIN.** No email, no
  passwords, nothing to set up. See the honest note about this below.
- **The Claude API for plain-English logging** — optional. No key, no text box;
  everything else works the same.
- **No ORM, no component library.** Fewer moving parts, and every file is plain
  enough to change by asking Claude.

### About the PINs

This is deliberately light security, sized for a group of friends tracking
beans and push-ups. Be clear-eyed about what it means:

- Anyone with your crew's invite code can see the list of member names.
- A 4-digit PIN is guessable if someone gets unlimited tries, so five wrong
  attempts locks that person out for 15 minutes. That makes casual guessing
  impractical, not impossible.
- PINs are stored hashed (scrypt), never in plain text, so nobody — including
  you looking at the database — can read them.

Don't put anything in here you'd mind a friend-of-a-friend seeing. For what
this app does, that's a fine trade. If it ever stops being fine, the fix is
proper email sign-in.

---

## Setting it up

You need a free **Vercel** account. Budget about ten minutes.

### 1. Create the database

1. Go to [vercel.com](https://vercel.com) and open the **Storage** tab.
2. **Create Database** → **Neon** → **Postgres**. Accept the free plan.
3. Open the database once it exists and copy the **connection string** — it's
   long and starts with `postgresql://`.

### 2. Point the app at it

Copy `.env.example` to a new file called `.env.local`, and paste the connection
string in:

```
DATABASE_URL=postgresql://...
```

### 3. Create the tables

```bash
npm run db:setup
```

That generates a secret for signing login cookies, creates every table, and
tells you how many it made. It's safe to run again — it never deletes anything,
so this is also how you pick up new tables when the app gains a feature.

### 4. Optional: plain-English logging

Skip this and the app works fine — you just tick everything by hand.

1. Go to [console.anthropic.com](https://console.anthropic.com) → **API keys** →
   create one. This is the one account outside Vercel that the app needs.
2. Add it to `.env.local`:

   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```

Then a text box appears on Today. Type something like *"eggs and coffee, chicken
salad, caved and had a slice of bread, 3L water, ran 5k easy, 84.1kg"* and it
works out which rules you met, logs the run and records the weigh-in.

It always shows you what it understood before writing anything, and it never
guesses — anything ambiguous goes in a "didn't know what to do with this" line
for you to tick by hand.

**Cost.** Each read is well under a cent. Five friends logging daily lands
around $2 a month on the default model. For a cheaper, faster, more
literal-minded read, set `ANTHROPIC_MODEL=claude-haiku-4-5`.

### 5. Run it

```bash
npm run dev
```

Open <http://localhost:3000>, tap **Start a crew**, and pick a name, your name
and a PIN. You'll land on the plan picker. Your crew's six-character invite
code is on the **Crew** tab — that's what you send your friends.

---

## Deploying

```bash
npx vercel
```

Then in the Vercel dashboard, **Settings → Environment Variables**, add:

- `DATABASE_URL` — the connection string. If you connected Neon through
  Vercel's Storage tab it already created this for you, possibly under a
  prefix like `STORAGE_DATABASE_URL`; the app accepts either, so there is
  nothing to add by hand in that case.
- `AUTH_SECRET` — copy the value `npm run db:setup` generated in `.env.local`
- `ANTHROPIC_API_KEY` — only if you set up plain-English logging

Redeploy, and you're live. Tell everyone to open the site on their phone and
use **Add to Home Screen** — it runs full-screen, like an app.

`.env.local` is git-ignored and should stay that way. It's the one file worth
being careful with.

---

## Putting it on your own domain

Two ways, and they are not equally fiddly.

### A sub-domain — `laflofit.laflo.pro`

Nothing to configure in the code. In this project's Vercel settings, **Domains
→ Add**, enter the sub-domain, and add the DNS record Vercel shows you. Done.

### A sub-path — `laflo.pro/laflofit`

Use this when you want one domain and the root already has something else on
it. It needs both projects to cooperate, because two Vercel projects cannot
serve the same domain: the site that owns `laflo.pro` has to forward the
sub-path to this app.

**1. Build this app under the sub-path.** In this project's Vercel settings,
add an environment variable:

```
BASE_PATH=/laflofit
```

Every URL the app generates then starts with `/laflofit` — pages, assets,
form submissions — and the login cookie scopes itself to that path so the
rest of `laflo.pro` never receives it. Redeploy after adding it.

**2. Forward the path from the site that owns the domain.** That is the
`jugaton` project. Its `next.config.ts` already has the rewrite; it only needs
an environment variable in its own Vercel settings:

```
LAFLOFIT_ORIGIN=https://YOUR-LAFLOFIT-PROJECT.vercel.app
```

Left unset, the rewrite is not added and that project behaves exactly as
before. Deploy it, and `laflo.pro/laflofit` serves the app.

Note what this costs you: every request goes through the other project first,
and the two are now coupled — the rewrite has to keep pointing at a URL this
project still answers on. The sub-domain has none of that. Worth choosing the
sub-path only because you actually want the single domain.

To run the sub-path locally:

```bash
BASE_PATH=/laflofit npm run dev
```

then open <http://localhost:3000/laflofit>.

---

## Where things live

```
src/
  app/
    login/            crew code -> pick your name -> PIN
    start/            create a new crew
    onboarding/       choose a plan, first time only
    (app)/            everything behind the login
      today/          the whole day: the text box, rules, food, training
        crew/           leaderboard and feed
      me/             biomarkers, history, stats and settings
      plan/           the rule editor
      actions.ts      every database write the app makes
  components/         shared UI, charts and meters
  lib/
    db.ts             the database connection
    session.ts        the signed login cookie
    pin.ts            PIN hashing
    interpret.ts      the single Claude call that reads a day into everything
    presets.ts        the built-in plans — edit these to change the starting rules
    scoring.ts        what counts as a perfect day, and how streaks work
    data.ts           every database read
db/schema.sql         the tables
scripts/setup-db.mjs  what `npm run db:setup` runs
```

Two files are worth knowing about if you want to change how the app *thinks*:
`src/lib/presets.ts` for the starting plans, and `src/lib/scoring.ts` for what
counts as a good day.

There's no row-level security the way a Supabase app would have, so every write
in `actions.ts` scopes itself to the signed-in user by hand. If you ever add a
query that changes data, it must mention `user_id` — otherwise it's a bug.

---

## Things worth deciding later

- **Everyone in a crew can see everyone's numbers**, including weights. The
  leaderboard deliberately shows 30-day *change* rather than absolute weight,
  but the data is readable by crewmates.
- **One crew per person.** That's what makes "pick your name, type your PIN"
  possible. Supporting several would mean reworking sign-in.
- **Nothing sends notifications yet.** No daily reminder to log, no nudge when
  someone's slipping. That's the obvious next addition.
- **No progress photos.** Those would need Vercel Blob, which is a separate
  thing to add.
