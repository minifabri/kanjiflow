"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/misc";
import {
  addSynonymAction,
  markKnownAction,
  removeSynonymAction,
  resetAction,
  resurrectAction,
  saveMnemonicAction,
  saveNoteAction,
  suspendAction,
} from "@/app/(app)/subjects/actions";

export function NoteEditor({ subjectId, initial }: { subjectId: string; initial: string }) {
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <label htmlFor="note" className="sr-only">
        Nota personale
      </label>
      <Textarea id="note" value={value} onChange={(e) => (setValue(e.target.value), setSaved(false))} placeholder="Appunti, collegamenti, frasi tue…" maxLength={5000} />
      <div className="flex items-center gap-3">
        <Button size="sm" variant="secondary" disabled={pending || value === initial} onClick={() => start(async () => (await saveNoteAction(subjectId, value), setSaved(true)))}>
          Salva nota
        </Button>
        {saved && <span className="text-xs text-success">Salvata</span>}
      </div>
    </div>
  );
}

export function MnemonicEditor({ subjectId, type, initial }: { subjectId: string; type: "meaning" | "reading"; initial: string }) {
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const id = `mn-${type}`;
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-xs text-muted">
        Il tuo mnemonico {type === "meaning" ? "del significato" : "della lettura"}
      </label>
      <Textarea id={id} value={value} onChange={(e) => (setValue(e.target.value), setSaved(false))} className="min-h-20" maxLength={2000} />
      <div className="flex items-center gap-3">
        <Button size="sm" variant="secondary" disabled={pending || value === initial} onClick={() => start(async () => (await saveMnemonicAction(subjectId, type, value), setSaved(true)))}>
          Salva
        </Button>
        {saved && <span className="text-xs text-success">Salvato</span>}
      </div>
    </div>
  );
}

export function SynonymEditor({ subjectId, userSynonyms }: { subjectId: string; userSynonyms: string[] }) {
  const [value, setValue] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      {userSynonyms.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {userSynonyms.map((s) => (
            <li key={s} className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-0.5 text-xs text-secondary">
              {s}
              <button aria-label={`Rimuovi ${s}`} className="ml-1 hover:text-foreground" onClick={() => start(() => removeSynonymAction(subjectId, s))}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!value.trim()) return;
          start(async () => {
            await addSynonymAction(subjectId, value);
            setValue("");
          });
        }}
      >
        <label htmlFor="syn" className="sr-only">
          Nuovo sinonimo
        </label>
        <Input id="syn" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Aggiungi un significato accettato" maxLength={80} />
        <Button type="submit" variant="secondary" disabled={pending}>
          Aggiungi
        </Button>
      </form>
    </div>
  );
}

export function SubjectActions({ subjectId, stage, suspended, started }: { subjectId: string; stage: number | null; suspended: boolean; started: boolean }) {
  const [pending, start] = useTransition();
  const [confirmReset, setConfirmReset] = useState(false);
  return (
    <div className="flex flex-wrap gap-2">
      {!started && (
        <>
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => start(() => markKnownAction(subjectId, "maintain"))}>
            Lo conosco già (in ripasso)
          </Button>
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(() => markKnownAction(subjectId, "burn"))}>
            Lo conosco già (bruciato)
          </Button>
        </>
      )}
      {started && stage === 9 && (
        <Button size="sm" variant="gold" disabled={pending} onClick={() => start(() => resurrectAction(subjectId))}>
          Ristudia
        </Button>
      )}
      {started && (
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => start(() => suspendAction(subjectId, !suspended))}>
          {suspended ? "Riprendi" : "Sospendi"}
        </Button>
      )}
      {started &&
        (confirmReset ? (
          <Button size="sm" variant="destructive" disabled={pending} onClick={() => start(async () => (await resetAction(subjectId), setConfirmReset(false)))}>
            Conferma: torna in coda lezioni
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setConfirmReset(true)}>
            Reimposta
          </Button>
        ))}
    </div>
  );
}
