"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/misc";
import { loginAction, type LoginState } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, null);
  return (
    <form action={action} className="space-y-4 rounded-lg border border-border/60 bg-surface p-5">
      <input type="hidden" name="next" value={next} />
      <div className="space-y-1.5">
        <Label htmlFor="username">Nome utente</Label>
        <Input id="username" name="username" key={state?.username ?? ""} defaultValue={state?.username ?? ""} autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoFocus={!state?.username} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" autoFocus={!!state?.username} required />
      </div>
      {state?.error && (
        <p className="text-sm text-error" role="alert">
          {state.error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Accesso…" : "Entra"}
      </Button>
    </form>
  );
}
