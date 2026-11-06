"use client";

import { useState, useTransition } from "react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/misc";
import { changePasswordAction, createAccountAction, resetPasswordAction, setDisabledAction, type AccountResult } from "./account-actions";

function ResultLine({ result }: { result: AccountResult | null }) {
  if (!result) return null;
  if (!result.ok) {
    return (
      <p className="text-sm text-error" role="alert">
        {result.error}
      </p>
    );
  }
  return (
    <div className="space-y-2" role="status">
      <p className="text-sm text-success">{result.message}</p>
      {result.secret && <Credentials {...result.secret} />}
    </div>
  );
}

/** Le credenziali si vedono una volta sola: la password non è salvata in chiaro da nessuna parte. */
function Credentials({ username, password }: { username: string; password: string }) {
  const [copied, setCopied] = useState(false);
  const text = `Indirizzo: ${typeof window !== "undefined" ? window.location.origin : ""}\nNome utente: ${username}\nPassword: ${password}`;
  return (
    <div className="rounded-md border border-gold/40 bg-gold/5 p-3 text-sm">
      <p className="mb-2 text-xs text-gold">Copiale ora e mandale al tuo amico: la password non verrà più mostrata.</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-muted">Nome utente</dt>
        <dd className="font-mono" data-testid="new-username">
          {username}
        </dd>
        <dt className="text-muted">Password</dt>
        <dd className="font-mono" data-testid="new-password">
          {password}
        </dd>
      </dl>
      <Button
        size="sm"
        variant="secondary"
        className="mt-3"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
          } catch {
            /* appunti non disponibili: si copia a mano */
          }
        }}
      >
        <Copy aria-hidden /> {copied ? "Copiato" : "Copia indirizzo e credenziali"}
      </Button>
    </div>
  );
}

export function ChangePasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [result, setResult] = useState<AccountResult | null>(null);
  const [pending, start] = useTransition();
  const mismatch = confirm.length > 0 && next !== confirm;
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (next !== confirm) return;
        start(async () => {
          const r = await changePasswordAction({ current, next });
          setResult(r);
          if (r.ok) {
            setCurrent("");
            setNext("");
            setConfirm("");
          }
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="pw-current">Password attuale</Label>
          <Input id="pw-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pw-new">Nuova password</Label>
          <Input id="pw-new" type="password" autoComplete="new-password" minLength={10} value={next} onChange={(e) => setNext(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pw-confirm">Ripeti</Label>
          <Input id="pw-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required aria-invalid={mismatch} />
        </div>
      </div>
      {mismatch && <p className="text-sm text-error">Le due password non coincidono.</p>}
      <ResultLine result={result} />
      <Button type="submit" size="sm" variant="secondary" disabled={pending || mismatch || !current || next.length < 10}>
        Cambia password
      </Button>
      <p className="text-xs text-muted">Almeno 10 caratteri. Dopo il cambio vengono chiuse le sessioni aperte sugli altri dispositivi.</p>
    </form>
  );
}

export function CreateAccountForm() {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [result, setResult] = useState<AccountResult | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await createAccountAction({ username, displayName });
          setResult(r);
          if (r.ok) {
            setUsername("");
            setDisplayName("");
          }
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="acc-username">Nome utente</Label>
          <Input
            id="acc-username"
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase())}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="es. marco"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="acc-name">Nome visualizzato</Label>
          <Input id="acc-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="es. Marco" />
        </div>
      </div>
      <ResultLine result={result} />
      <Button type="submit" size="sm" disabled={pending || username.length < 2}>
        Crea account
      </Button>
      <p className="text-xs text-muted">
        Viene generata una password temporanea: il tuo amico potrà cambiarla in Impostazioni. Al primo accesso farà la sua configurazione iniziale; i
        suoi progressi sono separati dai tuoi.
      </p>
    </form>
  );
}

export function AccountRowActions({ userId, disabled, isSelf, isAdmin }: { userId: string; disabled: boolean; isSelf: boolean; isAdmin: boolean }) {
  const [result, setResult] = useState<AccountResult | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {!isSelf && (
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => start(async () => setResult(await resetPasswordAction(userId)))}>
            Nuova password
          </Button>
        )}
        {!isSelf && !isAdmin && (
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => setResult(await setDisabledAction(userId, !disabled)))}>
            {disabled ? "Riattiva" : "Disattiva"}
          </Button>
        )}
      </div>
      <ResultLine result={result} />
    </div>
  );
}
