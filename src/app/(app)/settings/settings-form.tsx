"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, NativeSelect } from "@/components/ui/misc";
import { updateSettingsAction, type SettingsState } from "./actions";

interface Props {
  settings: {
    dailyLessonLimit: number;
    lessonBatchSize: number;
    maxApprenticeItems: number;
    studyPath: string;
    targetJlpt: string;
    typoTolerance: string;
    questionPriority: string;
    showFurigana: boolean;
    showRomajiHints: boolean;
    theme: string;
    interfaceLanguage: string;
    timezone: string;
    reviewReminders: boolean;
    roundDownToHour: boolean;
    guruPenaltyFactor: number;
  };
  intervals: { stage: number; label: string; hours: number; defaultHours: number }[];
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

function Check({ name, label, defaultChecked, hint }: { name: string; label: string; defaultChecked: boolean; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-1 accent-[var(--color-primary)]" />
      <span>
        <span className="block text-sm">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
    </label>
  );
}

export function SettingsForm({ settings: s, intervals }: Props) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(updateSettingsAction, null);
  return (
    <form action={action} className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Studio</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field id="studyPath" label="Percorso">
            <NativeSelect id="studyPath" name="studyPath" defaultValue={s.studyPath}>
              <option value="jlpt">JLPT</option>
              <option value="guided">Guidato (con prerequisiti)</option>
              <option value="custom">Personalizzato (raccolte)</option>
            </NativeSelect>
          </Field>
          <Field id="targetJlpt" label="Livello JLPT obiettivo">
            <NativeSelect id="targetJlpt" name="targetJlpt" defaultValue={s.targetJlpt}>
              <option value="N3">N3</option>
              <option value="N4">N4</option>
              <option value="N5">N5</option>
            </NativeSelect>
          </Field>
          <Field id="dailyLessonLimit" label="Lezioni nuove al giorno">
            <Input id="dailyLessonLimit" name="dailyLessonLimit" type="number" min={0} max={200} defaultValue={s.dailyLessonLimit} />
          </Field>
          <Field id="lessonBatchSize" label="Elementi per gruppo di lezioni">
            <Input id="lessonBatchSize" name="lessonBatchSize" type="number" min={1} max={20} defaultValue={s.lessonBatchSize} />
          </Field>
          <Field id="maxApprenticeItems" label="Massimo elementi Apprendista" hint="Oltre questa soglia non si aprono nuove lezioni finché non ripassi.">
            <Input id="maxApprenticeItems" name="maxApprenticeItems" type="number" min={10} max={1000} defaultValue={s.maxApprenticeItems} />
          </Field>
          <Field id="questionPriority" label="Ordine delle domande">
            <NativeSelect id="questionPriority" name="questionPriority" defaultValue={s.questionPriority}>
              <option value="balanced">Casuale</option>
              <option value="meaning_first">Prima il significato</option>
              <option value="reading_first">Prima la lettura</option>
            </NativeSelect>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Risposte</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field id="typoTolerance" label="Tolleranza ai refusi (significati)" hint="Mai applicata se la risposta coincide con il significato di un altro elemento.">
            <NativeSelect id="typoTolerance" name="typoTolerance" defaultValue={s.typoTolerance}>
              <option value="off">Nessuna</option>
              <option value="conservative">Conservativa (consigliata)</option>
              <option value="lenient">Ampia</option>
            </NativeSelect>
          </Field>
          <Check name="showRomajiHints" label="Mostra suggerimenti romaji" defaultChecked={s.showRomajiHints} hint="Ricorda come scrivere ん, っ e le vocali lunghe nelle domande di lettura." />
          <Check
            name="showFurigana"
            label="Mostra furigana negli esempi"
            defaultChecked={s.showFurigana}
            hint="Per ora le frasi d'esempio non hanno letture verificate: l'opzione si applicherà quando saranno disponibili."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Intervalli SRS</CardTitle>
          <CardDescription>
            Ore di attesa dopo aver raggiunto ciascuno stadio. Regressione: errori = errori significato + lettura; arretramento = ⌈errori/2⌉, ×
            fattore dal Guru in su; minimo Apprendista 1.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {intervals.map((i) => (
              <Field key={i.stage} id={`interval-${i.stage}`} label={i.label} hint={`predefinito ${i.defaultHours >= 24 ? `${i.defaultHours / 24} g` : `${i.defaultHours} h`}`}>
                <Input id={`interval-${i.stage}`} name={`interval-${i.stage}`} type="number" min={0.1} step="any" defaultValue={i.hours} />
              </Field>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="guruPenaltyFactor" label="Fattore di penalità dal Guru in su">
              <NativeSelect id="guruPenaltyFactor" name="guruPenaltyFactor" defaultValue={String(s.guruPenaltyFactor)}>
                <option value="1">1 (più indulgente)</option>
                <option value="2">2 (predefinito)</option>
                <option value="3">3</option>
              </NativeSelect>
            </Field>
            <div className="pt-6">
              <Check name="roundDownToHour" label="Arrotonda le scadenze all'ora" defaultChecked={s.roundDownToHour} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Aspetto e lingua</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Field id="theme" label="Tema">
            <NativeSelect id="theme" name="theme" defaultValue={s.theme}>
              <option value="dark">Scuro</option>
              <option value="light">Chiaro</option>
              <option value="system">Come il sistema</option>
            </NativeSelect>
          </Field>
          <Field id="interfaceLanguage" label="Lingua dell'interfaccia" hint="L'inglese è previsto ma non ancora tradotto.">
            <NativeSelect id="interfaceLanguage" name="interfaceLanguage" defaultValue={s.interfaceLanguage}>
              <option value="it">Italiano</option>
              <option value="en">English (in arrivo)</option>
            </NativeSelect>
          </Field>
          <Field id="timezone" label="Fuso orario" hint="Usato per serie di studio e limiti giornalieri.">
            <Input id="timezone" name="timezone" defaultValue={s.timezone} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notifiche</CardTitle>
        </CardHeader>
        <CardContent>
          <Check
            name="reviewReminders"
            label="Promemoria ripassi"
            defaultChecked={s.reviewReminders}
            hint="Preferenza salvata; l'invio delle notifiche push non è ancora implementato."
          />
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        {state && <p className={state.ok ? "text-sm text-success" : "text-sm text-error"} role="status">{state.message}</p>}
        <Button type="submit" disabled={pending}>
          {pending ? "Salvataggio…" : "Salva impostazioni"}
        </Button>
      </div>
    </form>
  );
}
