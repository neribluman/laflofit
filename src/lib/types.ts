export type RuleKind = "do" | "avoid" | "count";
export type Cadence = "daily" | "weekly";
export type Units = "metric" | "imperial";

export type Crew = {
  id: string;
  name: string;
  invite_code: string;
  created_at: string;
};

/** Never carries pin_hash — that column is only ever read inside sign-in. */
export type User = {
  id: string;
  crew_id: string;
  display_name: string;
  emoji: string;
  units: Units;
  timezone: string;
  height_cm: number | null;
  birth_year: number | null;
  sex: "male" | "female" | "other" | null;
  activity_level: "sedentary" | "light" | "moderate" | "very" | null;
  goal_weight_kg: number | null;
  about: string | null;
  /** Whether a photo exists — never the bytes, which come from /avatar/[id]. */
  has_avatar: boolean;
  active_plan_id: string | null;
  created_at: string;
};

export type Plan = {
  id: string;
  crew_id: string | null;
  owner_id: string | null;
  name: string;
  description: string | null;
};

export type PlanRule = {
  id: string;
  plan_id: string;
  label: string;
  kind: RuleKind;
  unit: string | null;
  target: number | null;
  cadence: Cadence;
  points: number;
  sort_order: number;
};

export type DayLog = {
  id: string;
  user_id: string;
  log_date: string;
  plan_id: string | null;
  note: string | null;
};

export type RuleEntry = {
  day_log_id: string;
  rule_id: string;
  checked: boolean | null;
  value: number | null;
};

export type Workout = {
  id: string;
  user_id: string;
  workout_date: string;
  kind: string;
  minutes: number | null;
  intensity: "easy" | "moderate" | "hard";
  notes: string | null;
};

export type Measurement = {
  id: string;
  user_id: string;
  measured_on: string;
  weight_kg: number | null;
  body_fat: number | null;
  waist_cm: number | null;
  resting_hr: number | null;
  notes: string | null;
};

export type Exercise = {
  id: string;
  workout_id: string;
  name: string;
  sets: number | null;
  reps: number | null;
  weight_kg: number | null;
  distance_km: number | null;
  minutes: number | null;
  notes: string | null;
  sort_order: number;
};

export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack" | "drink";

export type Meal = {
  id: string;
  user_id: string;
  meal_date: string;
  description: string;
  slot: MealSlot | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fibre_g: number | null;
  estimated: boolean;
};

export type Comment = {
  id: string;
  user_id: string;
  target_type: string;
  target_id: string;
  body: string;
};

export type Reaction = {
  id: string;
  user_id: string;
  target_type: string;
  target_id: string;
  emoji: string;
};
