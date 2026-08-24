"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveIntake, type IntakeAnswers } from "@/app/(app)/profile-actions";
import { ACTIVITY_LEVELS } from "@/lib/profile";
import AvatarPicker from "@/components/AvatarPicker";

type StepKind = "number" | "choice" | "text" | "photo";

type Step = {
  key: keyof IntakeAnswers;
  kind: StepKind;
  question: string;
  note?: string;
  suffix?: string;
  placeholder?: string;
  choices?: { value: string; label: string; sub?: string }[];
};

const EMPTY: IntakeAnswers = {
  photo: "",
  age: "",
  sex: "",
  height: "",
  weight: "",
  goalWeight: "",
  activity: "",
  about: "",
};

export default function IntakeSurvey({
  thisYear,
  weightUnit,
  lengthUnit,
}: {
  thisYear: number;
  weightUnit: string;
  lengthUnit: string;
}) {
  const router = useRouter();
  const steps: Step[] = [
    {
      key: "photo",
      kind: "photo",
      question: "Put a face to the name",
      note: "Your crew sees this next to your score every day. It saves as soon as you take it.",
    },
    {
      key: "age",
      kind: "number",
      question: "How old are you?",
      note: "Used for the calorie maths, which needs it to mean anything.",
      suffix: "years",
      placeholder: "34",
    },
    {
      key: "sex",
      kind: "choice",
      question: "Sex?",
      note: "The calorie formula splits on it. Not shown to your crew, and you can decline.",
      choices: [
        { value: "male", label: "Male" },
        { value: "female", label: "Female" },
        { value: "other", label: "Rather not say", sub: "estimates get rougher" },
      ],
    },
    {
      key: "height",
      kind: "number",
      question: "How tall are you?",
      suffix: lengthUnit,
      placeholder: lengthUnit === "cm" ? "181" : "71",
    },
    {
      key: "weight",
      kind: "number",
      question: "What do you weigh now?",
      note: "This becomes the first point on your chart.",
      suffix: weightUnit,
      placeholder: weightUnit === "kg" ? "84" : "185",
    },
    {
      key: "goalWeight",
      kind: "number",
      question: "Where are you heading?",
      note: "Leave it blank if you're not chasing a number.",
      suffix: weightUnit,
      placeholder: weightUnit === "kg" ? "78" : "172",
    },
    {
      key: "activity",
      kind: "choice",
      question: "What does a normal week look like?",
      choices: ACTIVITY_LEVELS.map((level) => ({
        value: level.value,
        label: level.label,
      })),
    },
    {
      key: "about",
      kind: "text",
      question: "Anything else worth knowing?",
      note: "Injuries to work around, food you don't eat, what you're training for. This is read every time your day is analysed.",
      placeholder: "Dodgy left knee so no running. Vegetarian. Training for a half in May.",
    },
  ];

  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<IntakeAnswers>(EMPTY);
  const [saving, startSaving] = useTransition();

  const step = steps[index];
  const value = answers[step.key];
  const last = index === steps.length - 1;

  const set = (next: string) =>
    setAnswers((prev) => ({ ...prev, [step.key]: next }));

  const finish = () =>
    startSaving(async () => {
      await saveIntake(answers, thisYear);
      // The page decides what comes next; once the profile exists it moves on.
      router.refresh();
    });

  const advance = () => (last ? finish() : setIndex(index + 1));

  return (
    <div>
      <div className="mb-5 flex items-center gap-3">
        <button
          onClick={() => setIndex(Math.max(0, index - 1))}
          disabled={index === 0}
          aria-label="Back"
          className="btn-quiet -ml-2 px-2 py-1 disabled:opacity-0"
        >
          ‹
        </button>
        <div className="flex flex-1 gap-1">
          {steps.map((s, i) => (
            <span
              key={s.key}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i <= index ? "bg-accent" : "bg-line"
              }`}
            />
          ))}
        </div>
        <span className="nums text-xs text-muted">
          {index + 1}/{steps.length}
        </span>
      </div>

      <div key={step.key} className="animate-[fadeIn_.18s_ease-out]">
        <h2 className="text-xl font-bold tracking-tight">{step.question}</h2>
        {step.note && <p className="mt-1.5 text-sm text-muted">{step.note}</p>}

        <div className="mt-5">
          {step.kind === "choice" && (
            <div className="space-y-2">
              {step.choices!.map((choice) => (
                <button
                  key={choice.value}
                  onClick={() => {
                    setAnswers((prev) => ({ ...prev, [step.key]: choice.value }));
                    // Tapping an answer is the answer — don't make them confirm it.
                    if (last) finish();
                    else setIndex(index + 1);
                  }}
                  className={`w-full rounded-xl border p-3.5 text-left transition active:scale-[.99] ${
                    value === choice.value
                      ? "border-accent bg-accent/10"
                      : "border-line bg-surface-2 hover:border-muted"
                  }`}
                >
                  <span className="block text-sm font-semibold">{choice.label}</span>
                  {choice.sub && (
                    <span className="block text-xs text-muted">{choice.sub}</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {step.kind === "number" && (
            <div className="flex items-baseline gap-3">
              <input
                autoFocus
                type="number"
                inputMode="decimal"
                step="any"
                min={0}
                value={value}
                onChange={(e) => set(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && advance()}
                placeholder={step.placeholder}
                aria-label={step.question}
                className="field nums w-40 text-3xl font-bold"
              />
              <span className="text-sm text-muted">{step.suffix}</span>
            </div>
          )}

          {step.kind === "photo" && (
            <AvatarPicker onSaved={() => set("done")} />
          )}

          {step.kind === "text" && (
            <textarea
              autoFocus
              rows={4}
              maxLength={600}
              value={value}
              onChange={(e) => set(e.target.value)}
              placeholder={step.placeholder}
              aria-label={step.question}
              className="field resize-none"
            />
          )}
        </div>

        {step.kind !== "choice" && (
          // An empty answer still moves on, but the button stops competing
          // for attention — on the photo step the loud one is "Take a photo",
          // and everywhere else there is nothing yet to confirm.
          <button
            onClick={advance}
            disabled={saving}
            className={`mt-3 w-full ${value ? "btn-primary" : "btn-quiet"}`}
          >
            {saving
              ? "Saving…"
              : last
                ? value
                  ? "Done"
                  : "Skip and finish"
                : value
                  ? step.kind === "photo"
                    ? "Looks good"
                    : "Continue"
                  : "Skip this"}
          </button>
        )}
      </div>
    </div>
  );
}
