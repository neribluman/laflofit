"use client";

import { useActionState } from "react";
import { joinCrew, type AuthState } from "./actions";
import SubmitButton from "@/components/SubmitButton";
import PinInput from "@/components/PinInput";
import { useTimezone } from "@/components/useTimezone";

export default function JoinForm({
  code,
  crewName,
}: {
  code: string;
  crewName: string;
}) {
  const [state, action] = useActionState<AuthState, FormData>(joinCrew, {});
  const timezone = useTimezone();

  return (
    <form action={action} className="card space-y-4 p-6">
      <input type="hidden" name="code" value={code} />
      <input type="hidden" name="timezone" value={timezone} />

      <div>
        <label className="label" htmlFor="display_name">
          What should {crewName} call you?
        </label>
        <input
          id="display_name"
          name="display_name"
          required
          maxLength={40}
          autoFocus
          className="field"
          placeholder="Neri"
        />
      </div>

      <PinInput label="Choose a 4-digit PIN" />
      <p className="text-xs text-muted">
        This is how you get back in on this phone and any other. Pick something
        you&apos;ll remember — there&apos;s no email to reset it with.
      </p>

      <SubmitButton pendingLabel="Joining…">Join {crewName}</SubmitButton>
      {state.error && <p className="text-sm text-bad">{state.error}</p>}
    </form>
  );
}
