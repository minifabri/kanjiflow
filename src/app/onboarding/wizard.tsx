"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, Input, Label, NativeSelect, Textarea } from "@/components/ui/misc";
import { Logo } from "@/components/logo";
import { AnswerInput } from "@/components/study/answer-input";
import {
  meaningFeedback,
  readingFeedback,
  validateMeaning,
  validateReading,
  type ExpectedMeaning,
  type ExpectedReading,
  type Feedback,
} from "@/domain/answers";
import { cn } from "@/lib/utils";
import { completeOnboarding, previewPasted } from "./actions";

export interface PlacementKanji {
  id: string;
  characters: string;
  meaning: string;
  band: string;
  meanings: ExpectedMeaning[];
  readings: ExpectedReading[];
}

type Band = "N5" | "N4" | "N3";
const BANDS: Band[] = ["N5", "N4", "N3"];
const stepsFor = (band: Band) => ["Obiettivo", "Già conosciuti", "Test di posizionamento", `Kanji ${band}`, "Riepilogo"];
/** Fasce sotto l'obiettivo: proposte come "già conosciute". */
const bandsBelow = (band: Band) => BANDS.slice(0, BANDS.indexOf(band));
const PLACEMENT_SIZE = 12;

export function OnboardingWizard({
  initialName,
  kanji,
  kanjiCounts,
  vocabCounts,
  alreadyDone,
}: {
  initialName: string;
  kanji: PlacementKanji[];
  kanjiCounts: Record<string, number>;
  vocabCounts: Record<string, number>;
  alreadyDone: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [displayName, setDisplayName] = useState(initialName === "Studente" ? "" : initialName);
  const [targetJlpt, setTargetJlpt] = useState<"N5" | "N4" | "N3" | "N2" | "N1">("N3");
  const [studyPath, setStudyPath] = useState<"jlpt" | "guided" | "custom">("jlpt");
  const [dailyLessonLimit, setDailyLessonLimit] = useState(15);
  const [knownBands, setKnownBands] = useState<Band[]>(["N5", "N4"]);
  // N2/N1 non sono ancora nel dataset: per lo studio vale la fascia più alta disponibile.
  const band: Band = targetJlpt === "N5" || targetJlpt === "N4" ? targetJlpt : "N3";
  const STEPS = stepsFor(band);
  const [knownMode, setKnownMode] = useState<"maintain" | "burn">("maintain");
  const [known, setKnown] = useState<Set<string>>(new Set());
  const [pasted, setPasted] = useState("");
  const [pastePreview, setPastePreview] = useState<{ found: number; missingCount: number } | null>(null);
  const [placementResults, setPlacementResults] = useState<{ id: string; ok: boolean }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const bandKanji = useMemo(() => kanji.filter((k) => k.band === band), [kanji, band]);
  const sample = useMemo(() => {
    // Campione stabile per la sessione: un kanji ogni n, per coprire l'intera lista della fascia (ordinata per frequenza).
    const step = Math.max(1, Math.floor(bandKanji.length / PLACEMENT_SIZE));
    return bandKanji.filter((_, i) => i % step === Math.floor(step / 2)).slice(0, PLACEMENT_SIZE);
  }, [bandKanji]);

  const toggleKnown = (id: string) =>
    setKnown((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submit = () => {
    setError(null);
    startTransition(async () => {
      try {
        await completeOnboarding({
          displayName: displayName.trim() || "Studente",
          targetJlpt,
          studyPath,
          dailyLessonLimit,
          knownBands,
          knownMode,
          knownKanjiIds: [...known],
          pastedText: pasted,
        });
        router.replace("/");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Errore durante il salvataggio");
      }
    });
  };

  const knownBandKanji = knownBands.reduce((a, b) => a + (kanjiCounts[b] ?? 0), 0);
  const knownBandVocab = knownBands.reduce((a, b) => a + (vocabCounts[b] ?? 0), 0);

  return (
    <div>
      <div className="mb-8 flex items-center gap-3">
        <Logo />
        <div>
          <p className="text-[15px] font-semibold">KanjiFlow</p>
          <p className="text-xs text-muted">Configurazione iniziale{alreadyDone && " (già completata: puoi rifarla)"}</p>
        </div>
      </div>

      <ol className="mb-6 flex flex-wrap gap-2" aria-label="Passaggi">
        {STEPS.map((s, i) => (
          <li key={s}>
            <span
              aria-current={i === step ? "step" : undefined}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs text-muted",
                i === step && "border-primary/60 text-foreground",
                i < step && "text-secondary",
              )}
            >
              {i < step ? <Check className="size-3" aria-hidden /> : <span className="tabular-nums">{i + 1}</span>}
              {s}
            </span>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <Card>
          <CardContent className="space-y-5 pt-5">
            <h1 className="text-xl font-medium">Obiettivo di studio</h1>
            <div className="space-y-2">
              <Label htmlFor="name">Come ti chiami?</Label>
              <Input id="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Nome visualizzato" maxLength={40} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="target">Livello obiettivo</Label>
                <NativeSelect
                  id="target"
                  value={targetJlpt}
                  onChange={(e) => {
                    const t = e.target.value as typeof targetJlpt;
                    setTargetJlpt(t);
                    const b: Band = t === "N5" || t === "N4" ? t : "N3";
                    setKnownBands(bandsBelow(b));
                    setPlacementResults([]);
                    setKnown(new Set());
                  }}
                >
                  <option value="N3">N3</option>
                  <option value="N4">N4</option>
                  <option value="N5">N5</option>
                </NativeSelect>
                <p className="text-xs text-muted">Questa versione include kanji e vocaboli fino a N3.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="limit">Lezioni nuove al giorno</Label>
                <Input id="limit" type="number" min={0} max={100} value={dailyLessonLimit} onChange={(e) => setDailyLessonLimit(Number(e.target.value))} />
              </div>
            </div>
            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-medium">Percorso</legend>
              {(
                [
                  ["jlpt", "Percorso JLPT", "Kanji della fascia obiettivo subito disponibili; i vocaboli si sbloccano quando ne conosci i kanji. Consigliato."],
                  ["guided", "Percorso guidato", "Radicali → kanji → vocaboli, con prerequisiti: più lento, più strutturato."],
                  ["custom", "Percorso personalizzato", "Studi solo le raccolte che crei tu."],
                ] as const
              ).map(([value, title, desc]) => (
                <label
                  key={value}
                  className={cn(
                    "flex cursor-pointer gap-3 rounded-md border border-border p-3 hover:bg-elevated/50",
                    studyPath === value && "border-primary/60 bg-elevated/50",
                  )}
                >
                  <input type="radio" name="path" value={value} checked={studyPath === value} onChange={() => setStudyPath(value)} className="mt-1 accent-[var(--color-primary)]" />
                  <span>
                    <span className="block text-sm font-medium">{title}</span>
                    <span className="block text-xs text-muted">{desc}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          </CardContent>
        </Card>
      )}

      {step === 1 && (
        <Card>
          <CardContent className="space-y-5 pt-5">
            <h1 className="text-xl font-medium">Cosa conosci già</h1>
            <p className="text-sm text-muted">
              Le fasce N5/N4 seguono liste della community (J. Waller), non un elenco ufficiale JLPT: il JLPT non pubblica liste di kanji dal 2010.
            </p>
            <div className="space-y-2">
              {bandsBelow(band).length === 0 && <p className="text-sm text-muted">Obiettivo N5: si parte da zero, nessuna fascia da segnare come nota.</p>}
              {bandsBelow(band).map((band) => (
                <label key={band} className="flex cursor-pointer items-center gap-3 rounded-md border border-border p-3 hover:bg-elevated/50">
                  <input
                    type="checkbox"
                    checked={knownBands.includes(band)}
                    onChange={(e) => setKnownBands((prev) => (e.target.checked ? [...prev, band] : prev.filter((b) => b !== band)))}
                    className="accent-[var(--color-primary)]"
                  />
                  <span className="text-sm">
                    Conosco già i contenuti <strong>{band}</strong>
                    <span className="block text-xs text-muted">
                      {kanjiCounts[band] ?? 0} kanji e {vocabCounts[band] ?? 0} vocaboli
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-medium">Come trattarli</legend>
              {(
                [
                  ["maintain", "Mantienili in ripasso", "Partono da Maestro con ripassi distribuiti sui prossimi 30 giorni: un mantenimento leggero."],
                  ["burn", "Considerali bruciati", "Nessun ripasso automatico; puoi sempre ripassarli su richiesta."],
                ] as const
              ).map(([value, title, desc]) => (
                <label
                  key={value}
                  className={cn("flex cursor-pointer gap-3 rounded-md border border-border p-3 hover:bg-elevated/50", knownMode === value && "border-primary/60 bg-elevated/50")}
                >
                  <input type="radio" name="mode" checked={knownMode === value} onChange={() => setKnownMode(value)} className="mt-1 accent-[var(--color-primary)]" />
                  <span>
                    <span className="block text-sm font-medium">{title}</span>
                    <span className="block text-xs text-muted">{desc}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <div className="space-y-2">
              <Label htmlFor="paste">Importa un elenco personale di kanji conosciuti (facoltativo)</Label>
              <Textarea
                id="paste"
                value={pasted}
                onChange={(e) => {
                  setPasted(e.target.value);
                  setPastePreview(null);
                }}
                placeholder="Incolla qui i kanji in qualsiasi formato: 日本語、学校…"
                className="jp"
              />
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={!pasted.trim()}
                  onClick={() => startTransition(async () => setPastePreview(await previewPasted(pasted)))}
                >
                  Verifica elenco
                </Button>
                {pastePreview && (
                  <p className="text-xs text-muted">
                    {pastePreview.found} kanji riconosciuti
                    {pastePreview.missingCount > 0 && ` · ${pastePreview.missingCount} non presenti nel dataset (ignorati)`}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Placement
          band={band}
          sample={sample}
          results={placementResults}
          onDone={(results) => {
            setPlacementResults(results);
            setKnown((prev) => new Set([...prev, ...results.filter((r) => r.ok).map((r) => r.id)]));
          }}
        />
      )}

      {step === 3 && (
        <Card>
          <CardContent className="space-y-4 pt-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-xl font-medium">Kanji {band} che conosci già</h1>
                <p className="mt-1 text-sm text-muted">Tocca per selezionare quelli da saltare. Quelli del test sono già selezionati.</p>
              </div>
              <Badge variant="primary">{[...known].filter((id) => bandKanji.some((k) => k.id === id)).length} selezionati</Badge>
            </div>
            <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-10 md:grid-cols-12" role="group" aria-label={`Kanji ${band}`}>
              {bandKanji.map((k) => {
                const on = known.has(k.id);
                return (
                  <button
                    key={k.id}
                    type="button"
                    aria-pressed={on}
                    title={k.meaning}
                    onClick={() => toggleKnown(k.id)}
                    className={cn(
                      "kanji-display aspect-square rounded-md border border-border text-xl transition-colors hover:border-primary/50",
                      on ? "border-primary bg-primary/20 text-foreground" : "bg-elevated/50 text-foreground/90",
                    )}
                  >
                    {k.characters}
                    <span className="sr-only">{k.meaning}</span>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {step === 4 && (
        <Card>
          <CardContent className="space-y-4 pt-5">
            <h1 className="text-xl font-medium">Riepilogo</h1>
            <ul className="space-y-2 text-sm">
              <li>
                Percorso: <strong>{studyPath === "jlpt" ? "JLPT" : studyPath === "guided" ? "guidato" : "personalizzato"}</strong>, obiettivo{" "}
                <strong>{targetJlpt}</strong>, {dailyLessonLimit} lezioni al giorno
              </li>
              <li>
                Già conosciuti: {knownBands.length ? `${knownBands.join(" + ")} (${knownBandKanji} kanji, ${knownBandVocab} vocaboli)` : "nessuna fascia"}
                {known.size > 0 && `, più ${known.size} kanji selezionati`}
                {pastePreview?.found ? `, più ${pastePreview.found} dall'elenco incollato` : pasted.trim() ? ", più l'elenco incollato" : ""}
              </li>
              <li>Trattamento: {knownMode === "maintain" ? "mantenuti in ripasso (Maestro)" : "bruciati, ripassabili su richiesta"}</li>
            </ul>
            <p className="text-xs text-muted">Puoi cambiare tutto più tardi dalle impostazioni e dalla scheda di ogni kanji.</p>
            {error && <p className="text-sm text-error">{error}</p>}
          </CardContent>
        </Card>
      )}

      <div className="mt-6 flex justify-between gap-3">
        <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || pending}>
          <ChevronLeft aria-hidden /> Indietro
        </Button>
        {step < STEPS.length - 1 ? (
          <Button onClick={() => setStep((s) => s + 1)}>
            {step === 2 && placementResults.length === 0 ? "Salta il test" : "Avanti"} <ChevronRight aria-hidden />
          </Button>
        ) : (
          <Button onClick={submit} disabled={pending}>
            {pending ? "Salvataggio…" : "Inizia a studiare"}
          </Button>
        )}
      </div>
    </div>
  );
}

function Placement({
  band,
  sample,
  results,
  onDone,
}: {
  band: Band;
  sample: PlacementKanji[];
  results: { id: string; ok: boolean }[];
  onDone: (r: { id: string; ok: boolean }[]) => void;
}) {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"meaning" | "reading">("meaning");
  const [local, setLocal] = useState<{ id: string; ok: boolean }[]>([]);
  const [meaningOk, setMeaningOk] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [locked, setLocked] = useState(false);

  if (results.length > 0) {
    const ok = results.filter((r) => r.ok).length;
    return (
      <Card>
        <CardContent className="space-y-3 pt-5">
          <h1 className="text-xl font-medium">Risultato del test</h1>
          <p className="text-sm">
            Hai riconosciuto <strong>{ok}</strong> kanji su {results.length} (significato e lettura).
            {` Stima indicativa: circa il ${Math.round((ok / results.length) * 100)}% dei kanji ${band}.`}
          </p>
          <p className="text-xs text-muted">I kanji riconosciuti sono stati preselezionati nel passaggio successivo, dove puoi correggere la scelta.</p>
        </CardContent>
      </Card>
    );
  }

  const k = sample[index];
  if (!k) return null;

  const next = (ok: boolean) => {
    const updated = [...local, { id: k.id, ok }];
    setLocal(updated);
    setFeedback(null);
    setLocked(false);
    setPhase("meaning");
    setMeaningOk(false);
    if (index + 1 >= sample.length) onDone(updated);
    else setIndex(index + 1);
  };

  const onSubmit = (answer: string) => {
    if (locked) {
      if (phase === "meaning") {
        setPhase("reading");
        setFeedback(null);
        setLocked(false);
      } else next(meaningOk && feedback?.tone !== "error");
      return;
    }
    if (phase === "meaning") {
      const v = validateMeaning(answer, { meanings: k.meanings, typoTolerance: "conservative" });
      if (v.verdict === "retry") return setFeedback(meaningFeedback(v));
      setMeaningOk(v.verdict === "correct");
      setFeedback(meaningFeedback(v));
      setLocked(true);
    } else {
      const v = validateReading(answer, { subjectType: "kanji", readings: k.readings });
      if (v.verdict === "retry") return setFeedback(readingFeedback(v));
      setFeedback(readingFeedback(v));
      setLocked(true);
    }
  };

  return (
    <Card>
      <CardContent className="space-y-5 pt-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-medium">Test di posizionamento</h1>
          <span className="text-xs tabular-nums text-muted">
            {index + 1}/{sample.length}
          </span>
        </div>
        <p className="text-sm text-muted">Un campione di kanji {band} dal più al meno frequente. Rispondi come in un ripasso, oppure premi «Non lo so».</p>
        <div className="kanji-display py-6 text-center text-7xl sm:text-8xl">{k.characters}</div>
        <AnswerInput
          key={`${k.id}-${phase}`}
          mode={phase}
          onSubmit={onSubmit}
          state={locked ? (feedback?.tone === "error" ? "incorrect" : "correct") : "idle"}
        />
        {feedback && <p className={cn("text-sm", feedback.tone === "error" ? "text-error" : feedback.tone === "success" ? "text-success" : "text-gold")}>{feedback.message}</p>}
        {locked && (
          <p className="text-xs text-muted">
            {phase === "meaning" ? `Significato: ${k.meaning}` : `Letture: ${k.readings.filter((r) => r.isPrimary).map((r) => r.reading).join("、")}`} · premi Invio per continuare
          </p>
        )}
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={() => next(false)}>
            Non lo so
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
