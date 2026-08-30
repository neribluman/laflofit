-- LaFloFit schema, for a plain Postgres database (Neon).
-- You do not need to run this by hand: `npm run db:setup` does it for you.
-- Safe to run more than once.

-- ---------------------------------------------------------------------------
-- Crews and people
--
-- One person belongs to exactly one crew. That is a deliberate simplification:
-- it makes signing in "crew code + your name + your PIN" with no email at all.
-- ---------------------------------------------------------------------------

create table if not exists crews (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  invite_code text not null unique,
  created_at  timestamptz not null default now()
);

create table if not exists users (
  id             uuid primary key default gen_random_uuid(),
  crew_id        uuid not null references crews(id) on delete cascade,
  display_name   text not null,
  -- scrypt, as "salt:hash". Never the PIN itself.
  pin_hash       text not null,
  emoji          text not null default '💪',
  units          text not null default 'metric',
  -- IANA name, e.g. 'Asia/Jerusalem'. Decides when "today" rolls over for you,
  -- so friends in different countries each get their own midnight.
  timezone       text not null default 'UTC',
  active_plan_id uuid,
  -- Four digits is easy to guess if you are allowed unlimited attempts.
  failed_attempts int not null default 0,
  locked_until   timestamptz,
  created_at     timestamptz not null default now()
);

-- Two people in the same crew cannot share a name, because the name is how you
-- pick yourself at the sign-in screen.
create unique index if not exists users_crew_name_idx
  on users (crew_id, lower(display_name));

-- ---------------------------------------------------------------------------
-- Plans: a named set of rules. Slow-carb is just one instance of this.
-- ---------------------------------------------------------------------------

create table if not exists plans (
  id          uuid primary key default gen_random_uuid(),
  crew_id     uuid references crews(id) on delete cascade,  -- null = personal
  owner_id    uuid references users(id) on delete set null,
  name        text not null,
  description text,
  created_at  timestamptz not null default now()
);

create table if not exists plan_rules (
  id         uuid primary key default gen_random_uuid(),
  plan_id    uuid not null references plans(id) on delete cascade,
  label      text not null,
  -- 'do'    tick it when you did the good thing        (ate protein at breakfast)
  -- 'avoid' tick it when you successfully stayed off it (no white carbs)
  -- 'count' enter a number, target is the goal          (litres of water >= 3)
  kind       text not null default 'do',
  unit       text,
  target     numeric,
  -- 'daily' scores every day. 'weekly' is an allowance you spend once a week,
  -- which is how slow-carb's cheat day works.
  cadence    text not null default 'daily',
  points     int  not null default 1,
  sort_order int  not null default 0
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'users_active_plan_id_fkey'
  ) then
    alter table users
      add constraint users_active_plan_id_fkey
      foreign key (active_plan_id) references plans(id) on delete set null;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- The daily log
-- ---------------------------------------------------------------------------

create table if not exists day_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  log_date   date not null,
  plan_id    uuid references plans(id) on delete set null,
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, log_date)
);

create table if not exists rule_entries (
  day_log_id uuid not null references day_logs(id) on delete cascade,
  rule_id    uuid not null references plan_rules(id) on delete cascade,
  checked    boolean,
  value      numeric,
  primary key (day_log_id, rule_id)
);

create table if not exists workouts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  workout_date date not null,
  kind         text not null,
  minutes      int,
  intensity    text not null default 'moderate',
  notes        text,
  created_at   timestamptz not null default now()
);

create table if not exists measurements (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  measured_on date not null,
  -- Always stored in kg and cm, converted for display. Keeps the maths sane
  -- when two friends use different units.
  weight_kg   numeric,
  body_fat    numeric,
  waist_cm    numeric,
  notes       text,
  created_at  timestamptz not null default now(),
  unique (user_id, measured_on)
);

-- ---------------------------------------------------------------------------
-- What the workout actually consisted of
--
-- Hangs off a workout, so deleting the session takes its exercises with it.
-- Weights are kg and distances km, converted at the edges like everything else.
-- ---------------------------------------------------------------------------

create table if not exists exercises (
  id          uuid primary key default gen_random_uuid(),
  workout_id  uuid not null references workouts(id) on delete cascade,
  name        text not null,
  sets        int,
  reps        int,
  weight_kg   numeric,
  distance_km numeric,
  minutes     int,
  notes       text,
  sort_order  int not null default 0
);

create index if not exists exercises_workout_idx on exercises (workout_id, sort_order);

-- ---------------------------------------------------------------------------
-- What they actually ate
--
-- Separate from plan rules on purpose: rules are opinions about a diet, meals
-- are facts about a day. You get the macros whether or not your plan happens
-- to have a rule about them, and one bad line can be deleted without touching
-- the rest of the day.
-- ---------------------------------------------------------------------------

create table if not exists meals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  meal_date   date not null,
  description text not null,
  -- 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'drink', or null if unsaid
  slot        text,
  calories    numeric,
  protein_g   numeric,
  carbs_g     numeric,
  fat_g       numeric,
  fibre_g     numeric,
  -- true when the numbers came from an estimate rather than something stated
  estimated   boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists meals_user_date_idx on meals (user_id, meal_date desc);

-- ---------------------------------------------------------------------------
-- Accountability: cheering and heckling
-- ---------------------------------------------------------------------------

create table if not exists reactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  target_type text not null,   -- 'day_log' | 'workout'
  target_id   uuid not null,
  emoji       text not null,
  created_at  timestamptz not null default now(),
  unique (user_id, target_type, target_id, emoji)
);

create table if not exists comments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  target_type text not null,
  target_id   uuid not null,
  body        text not null,
  created_at  timestamptz not null default now()
);

create index if not exists day_logs_user_date_idx     on day_logs (user_id, log_date desc);
create index if not exists workouts_user_date_idx     on workouts (user_id, workout_date desc);
create index if not exists measurements_user_date_idx on measurements (user_id, measured_on desc);
create index if not exists reactions_target_idx       on reactions (target_type, target_id);
create index if not exists comments_target_idx        on comments (target_type, target_id);
create index if not exists plan_rules_plan_idx        on plan_rules (plan_id, sort_order);
create index if not exists users_crew_idx             on users (crew_id);

-- ---------------------------------------------------------------------------
-- Columns added after the first release
--
-- The create-table blocks above are guarded with "if not exists", which means
-- they do nothing on a database that already has the table. New columns
-- therefore need saying separately.
-- ---------------------------------------------------------------------------

-- Height barely changes, so it lives on the person rather than on each
-- weigh-in. It is what makes BMI possible.
alter table users add column if not exists height_cm numeric;

alter table measurements add column if not exists resting_hr int;

-- Who they are, for context rather than for scoring.
--
-- Birth year rather than age: age recomputes itself and never goes stale.
-- All optional — someone who tells us nothing still gets a working app; the
-- estimates are just vaguer.
alter table users add column if not exists birth_year int;
alter table users add column if not exists sex text;            -- 'male' | 'female' | 'other'
alter table users add column if not exists activity_level text; -- 'sedentary' | 'light' | 'moderate' | 'very'
alter table users add column if not exists goal_weight_kg numeric;
-- Free-form: goals, dietary restrictions, injuries, anything worth knowing.
alter table users add column if not exists about text;

-- Profile photo, as a data URL. Kept in the row rather than in blob storage
-- because it is resized to a 256px square before it ever leaves the browser —
-- about 20KB — and one per person is not worth another service to configure.
-- Served through /avatar/[id] so pages reference a URL the browser caches,
-- rather than carrying the bytes in every render.
alter table users add column if not exists avatar text;

-- The week's ruling on the crew, written by Claude from the standings.
--
-- Cached because it costs an API call and reads the same all day. `digest` is
-- a fingerprint of the numbers it was written from: when someone logs and the
-- standings move, the digest changes and the ruling gets rewritten. One row
-- per crew per day, so yesterday's is overwritten rather than piling up.
create table if not exists crew_banter (
  id         uuid primary key default gen_random_uuid(),
  crew_id    uuid not null references crews (id) on delete cascade,
  for_date   date not null,
  digest     text not null,
  body       jsonb not null,
  created_at timestamptz not null default now(),
  unique (crew_id, for_date)
);

-- Claude's read on one person's plan, kept so the button doesn't re-bill for
-- a picture that hasn't changed. One row per person: `digest` fingerprints the
-- profile, rules and logs it was written from, so editing a target or logging
-- a few days makes it stale and the next press writes a fresh one.
create table if not exists plan_reviews (
  user_id    uuid primary key references users (id) on delete cascade,
  digest     text not null,
  body       jsonb not null,
  created_at timestamptz not null default now()
);

-- The weekly write-up for pasting into WhatsApp. Cached like the ruling: one
-- row per crew per day, keyed on a digest of the standings it was written
-- from, so pressing the button twice costs one call.
create table if not exists crew_recaps (
  id         uuid primary key default gen_random_uuid(),
  crew_id    uuid not null references crews (id) on delete cascade,
  for_date   date not null,
  digest     text not null,
  body       jsonb not null,
  message    text not null,
  created_at timestamptz not null default now(),
  unique (crew_id, for_date)
);

-- ---------------------------------------------------------------------------
-- WhatsApp
--
-- A phone number is a far better identity than a display name: it arrives
-- verified with every message, and it is the thing that stops one person
-- ending up with four accounts. Nullable, because the app works without it.
-- ---------------------------------------------------------------------------
alter table users add column if not exists phone text;
create unique index if not exists users_phone_idx on users (phone) where phone is not null;

-- Short-lived codes for connecting a number to an account. The app shows one,
-- the person texts it to the bot, and the bot knows who they are. Single use.
create table if not exists phone_links (
  code       text primary key,
  user_id    uuid not null references users (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists phone_links_user_idx on phone_links (user_id);

-- Message ids Meta has already delivered. It retries anything it does not hear
-- a prompt 200 from, and a retry would log the same dinner twice.
create table if not exists whatsapp_seen (
  message_id text primary key,
  seen_at    timestamptz not null default now()
);
