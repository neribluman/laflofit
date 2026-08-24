import type { Cadence, RuleKind } from "./types";

export type PresetRule = {
  label: string;
  kind: RuleKind;
  unit?: string;
  target?: number;
  cadence?: Cadence;
  points?: number;
};

export type Preset = {
  key: string;
  name: string;
  blurb: string;
  emoji: string;
  rules: PresetRule[];
};

export const PRESETS: Preset[] = [
  {
    key: "calories-protein-training",
    name: "Calories, Protein & Training",
    emoji: "🍳",
    blurb:
      "The one most people want: a calorie ceiling, a protein floor, and showing up to train. Works alongside almost any way of eating.",
    rules: [
      { label: "Calories", kind: "count", unit: "kcal", target: 2000, points: 2 },
      { label: "Protein", kind: "count", unit: "g", target: 150, points: 2 },
      { label: "Trained today", kind: "do", points: 2 },
      { label: "Steps", kind: "count", unit: "steps", target: 8000 },
      { label: "Water", kind: "count", unit: "L", target: 2.5 },
      { label: "Rest day", kind: "do", cadence: "weekly", points: 0 },
    ],
  },
  {
    key: "slow-carb",
    name: "Slow-Carb",
    emoji: "🫘",
    blurb:
      "Tim Ferriss' five rules. Beans, lean protein and veg six days a week, then one cheat day where nothing counts.",
    rules: [
      { label: "30g protein within 30 min of waking", kind: "do", points: 2 },
      { label: "No white carbs (bread, rice, pasta, potato, cereal)", kind: "avoid", points: 2 },
      { label: "No fruit", kind: "avoid" },
      { label: "No liquid calories", kind: "avoid" },
      { label: "Legumes + veg at every meal", kind: "do" },
      { label: "Water", kind: "count", unit: "L", target: 2.5 },
      { label: "Cheat day", kind: "do", cadence: "weekly", points: 0 },
    ],
  },
  {
    key: "16-8",
    name: "16:8 Fasting",
    emoji: "⏳",
    blurb:
      "An eight-hour eating window, protein at every meal, and nothing but black coffee, tea and water outside it.",
    rules: [
      { label: "Ate only inside the 8-hour window", kind: "do", points: 2 },
      { label: "No calories outside the window", kind: "avoid", points: 2 },
      { label: "Protein", kind: "count", unit: "g", target: 130 },
      { label: "No alcohol", kind: "avoid" },
      { label: "Water", kind: "count", unit: "L", target: 2.5 },
    ],
  },
  {
    key: "move-more",
    name: "Move More",
    emoji: "🏃",
    blurb:
      "Training-first, food-light. Good if the diet is already sorted and the missing piece is showing up.",
    rules: [
      { label: "Trained today", kind: "do", points: 2 },
      { label: "Steps", kind: "count", unit: "steps", target: 10000 },
      { label: "Mobility / stretching", kind: "do" },
      { label: "7+ hours sleep", kind: "do" },
      { label: "Rest day", kind: "do", cadence: "weekly", points: 0 },
    ],
  },
];

export const getPreset = (key: string) => PRESETS.find((p) => p.key === key);

export const WORKOUT_KINDS = [
  "Strength",
  "Run",
  "Ride",
  "Swim",
  "Walk",
  "Class",
  "Sport",
  "Other",
] as const;

export const CHEER_EMOJI = ["🔥", "💪", "👏", "🫡", "👀", "🐐"] as const;
