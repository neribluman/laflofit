"use client";

import { useActionState } from "react";
import { signIn, type AuthState } from "./actions";
import SubmitButton from "@/components/SubmitButton";
import PinInput from "@/components/PinInput";
import Avatar from "@/components/Avatar";

export default function PinForm({
  userId,
  name,
  emoji,
  hasAvatar,
  code,
}: {
  userId: string;
  name: string;
  emoji: string;
  hasAvatar: boolean;
  code: string;
}) {
  const [state, action] = useActionState<AuthState, FormData>(signIn, {});

  return (
    <form action={action} className="card p-6">
      <input type="hidden" name="user_id" value={userId} />
      <div className="mb-4 flex flex-col items-center">
        <Avatar
          user={{ id: userId, emoji, display_name: name, has_avatar: hasAvatar }}
          size="lg"
          code={code}
        />
        <span className="mt-2 font-semibold">{name}</span>
      </div>
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
