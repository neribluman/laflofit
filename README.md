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
| **Log** | A strip of seven days with the one you're on in the middle, darker for a better day, and that month's totals on one line — days logged, average score, average calories, average protein. Tap a neighbouring day to move, or the date to jump anywhere. Everything below then reads and writes that day, so a forgotten Tuesday can be filled in on Friday. |
| **Me** | Your biomarkers — weight, height, BMI, body fat, waist, resting heart rate, goal, and an estimate of your maintenance calories — with somewhere to add a new reading, the weight trend, your training history, and settings. |
| **About you** | Asked once at sign-up as eight quick questions — kg/cm or lb/ft-in, your choice, set right there on the question — starting with a photo then age, sex, height, weight, goal, a normal week, and anything else worth knowing. Every later analysis gets this, so portions are judged against you rather than an average person, and it will tell you when a logged meal contradicts it. Every question is skippable, and it all stays editable from Me. |
| **Crew** | The tab the app opens on. Who's logged today, four leaderboards, 30-day weight movement, and a feed of everything the crew logged with reactions and comments. |
| **The boards** | **Overall** — each logged day is worth up to 100, being the share of your own plan you hit, summed over the week. **Protein** — grams per kilo of bodyweight. **Calories** — how close you stayed to your own target, where under counts against you as much as over. **Strength** — estimated one-rep max on squat, bench, deadlift and overhead press, added up and divided by your bodyweight. The three relative boards normalise by bodyweight so a 62kg and a 105kg member are actually comparable. |
| **Just tell me about your day** | One text box on Today, for the whole day. Write what you ate, what you lifted and how it went in plain English. It logs **every food and drink with estimated calories, protein, carbs, fat and fibre**, reads gym shorthand into **exercises with sets, reps and load**, ticks your plan's rules, and records a weigh-in. Shows you what it understood, and only writes once you confirm. |
| **Photograph your plate** | The camera button beside the box. Take a picture of your food and it names each item, estimates the portion from what's in shot for scale, and works out calories and macros — saying what it assumed, so you can correct it. Same preview as everything else: nothing is saved until you confirm. Photos are analysed and discarded, never stored. |
| **Macros** | Day totals sit alongside the checklist, with every food and every exercise listed and individually deletable. If your plan has a calorie or protein rule, it fills itself in from the food you logged rather than asking twice. |
| **Undo** | "Reset today" at the bottom of Today wipes that date back to never-logged. It lists exactly what will go — ticks, note, workouts, weigh-in — before it deletes anything. Individual workouts and weigh-ins can also be deleted one at a time from Log. |
| **Write your own plan** | Describe what you're after — *"drop 8kg by summer without losing strength, beer is my problem, I lift three times a week"* — and it builds the checklist: a calorie ceiling under your maintenance, a protein floor scaled to your weight, the specific thing you said you'd cut, and a weekly night off. Sized to you, because it reads your profile. Shown before anything is saved. |
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
and a PIN. To bring friends in, hit **Invite someone** on the Crew tab — it
sends a link that drops them straight onto a join screen. There is still a
six-character code behind it for reading down a phone, but nobody has to.

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

## Logging over WhatsApp

Optional. When it's set up, everyone gets a number they can text — "3 eggs and
a 5k run" goes straight into their day, and they can ask it things like "am I
getting enough protein?" and get an answer from their own figures.

Worth knowing before you start: **WhatsApp's API cannot read or post in group
chats.** This is one-to-one only. The group stays a group; the bot is a private
thread each person has.

1. **Create a Meta app.** developers.facebook.com → My Apps → Create App →
   *Business*. Add the **WhatsApp** product to it.
2. **Get a number.** The API Setup screen gives you a free test number
   immediately, which is enough to try this with. A test number can only message
   up to five recipients that you add by hand — fine for a crew this size, but
   you'll want a real one eventually.
3. **Copy four things** into Vercel → Settings → Environment Variables:
   - `WHATSAPP_PHONE_NUMBER_ID` and `WHATSAPP_TOKEN` from API Setup. Generate a
     **permanent** token via Business Settings → System Users; the one shown on
     that page expires in 24 hours.
   - `WHATSAPP_APP_SECRET` from App Settings → Basic.
   - `WHATSAPP_VERIFY_TOKEN` — invent any long random string.
   - `NEXT_PUBLIC_WHATSAPP_NUMBER` — the bot's number, digits only.
4. **Redeploy**, so the variables are baked in.
5. **Point the webhook at the app.** WhatsApp → Configuration → Edit:
   - Callback URL: `https://your-domain/api/whatsapp`
   - Verify token: the string from step 3
   - Save, then **Subscribe** to the `messages` field.

Then open the app, go to **Me → WhatsApp → Connect**, and send the code it
gives you. Texting `STOP` disconnects a number again.

### If Meta's developer platform is in your way

Every legitimate WhatsApp API runs on Meta's infrastructure — no provider
avoids that. What they avoid is Meta's *developer platform*: a provider owns
the Meta relationship and gives you an ordinary API instead.

**Twilio's WhatsApp sandbox needs no Meta account at all**, and is the fastest
way to have this working:

1. Sign up at twilio.com, then Messaging → Try it out → **Send a WhatsApp
   message**. It shows a shared number and a join phrase.
2. Each person sends that phrase to the number once, from the phone they'll
   use. (A sandbox is limited to people who have joined, and they must re-join
   after 72 hours of silence — fine for a crew, not for strangers.)
3. In Vercel, set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
   `TWILIO_WHATSAPP_FROM` (the sandbox number, as `whatsapp:+1...`) and
   `NEXT_PUBLIC_WHATSAPP_NUMBER` (the same number, digits only). Redeploy.
4. In the sandbox settings, set **When a message comes in** to
   `https://your-domain/api/whatsapp/twilio`, method POST.

Set the Twilio variables *or* the Meta ones, not both. Everything past the
front door — linking, logging, answering, STOP — is the same code either way.

Other providers do the same job with a real number instead of a sandbox:
360dialog charges a flat monthly fee with no per-message markup, and Gupshup,
Wati and Respond.io are more business-inbox than API. All of them still put a
Meta business account behind the scenes; they just do that part for you.

### What it costs

Replying to someone who messaged you first is free, within a 24-hour window.
Since every conversation here starts with them, the running cost is
approximately nothing — you pay only for messages the bot starts on its own.
Meta has changed this pricing more than once, so check the current rates before
you rely on it.

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

The La Floresta boar is the app's mark — it's the favicon, the home-screen
icon, and the logo on the sign-in and invite screens. Source lives in
`src/app/icon.png` (favicon), `src/app/apple-icon.png`, and `public/logo-*.png`
(the manifest and in-app logo). To change it, replace those four files.

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
