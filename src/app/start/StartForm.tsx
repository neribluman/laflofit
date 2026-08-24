"use client";

import { useActionState } from "react";
import { startCrew, type AuthState } from "@/app/login/actions";
import SubmitButton from "@/components/SubmitButton";
import PinInput from "@/components/PinInput";
import { useTimezone } from "@/components/useTimezone";

export default function StartForm() {
  const [state, action] = useActionState<AuthState, FormData>(startCrew, {});
  const timezone = useTimezone();

  return (
    <form action={action} className="card space-y-4 p-6">
      <input type="hidden" name="timezone" value={timezone} />

      <div>
        <label className="label" htmlFor="crew_name">
          Crew name
        </label>
        <input
          id="crew_name"
          name="crew_name"
          required
          maxLength={50}
          autoFocus
          className="field"
          placeholder="The Beanfathers"
        />
      </div>

      <div>
        <label className="label" htmlFor="display_name">
          Your name
        </label>
        <input
          id="display_name"
          name="display_name"
          required
          maxLength={40}
          className="field"
          placeholder="Neri"
        />
      </div>

      <PinInput label="Choose a 4-digit PIN" />

      <SubmitButton pendingLabel="Creating…">Create the crew</SubmitButton>
      <p className="text-xs text-muted">
        You&apos;ll get a six-character invite code to send your friends.
      </p>
      {state.error && <p className="text-sm text-bad">{state.error}</p>}
    </form>
  );
}
