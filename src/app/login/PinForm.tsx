"use client";

import { useActionState } from "react";
import { signIn, type AuthState } from "./actions";
import SubmitButton from "@/components/SubmitButton";
import PinInput from "@/components/PinInput";

export default function PinForm({
  userId,
  name,
  emoji,
}: {
  userId: string;
  name: string;
  emoji: string;
}) {
  const [state, action] = useActionState<AuthState, FormData>(signIn, {});

  return (
    <form action={action} className="card p-6">
      <input type="hidden" name="user_id" value={userId} />
      <p className="mb-4 text-center">
        <span className="block text-3xl">{emoji}</span>
        <span className="mt-1 block font-semibold">{name}</span>
      </p>
      <PinInput autoFocus />
      <div className="mt-4">
        <SubmitButton pendingLabel="Checking…">Sign in</SubmitButton>
      </div>
      {state.error && (
        <p className="mt-3 text-center text-sm text-bad">{state.error}</p>
      )}
    </form>
  );
}
