"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Check, Info, Pause, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Kbd, Progress } from "@/components/ui/misc";
import { AnswerInput, type AnswerState } from "./answer-input";
import { QuestionBanner } from "./question-banner";
import { MeaningSection, ReadingSection, MnemonicSection, RelatedSection } from "./subject-sections";
import { feedbackColor } from "./lesson-session";
import { SpeakButton, speak, useAutoplayAudio } from "./speak-button";
import { speakableReading } from "@/lib/speech-text";
import { stageLabel, type QuestionType, type SrsStage } from "@/domain/srs";
import type { Feedback } from "@/domain/answers";
import type { QueueItem, SessionState, SubmitResult } from "@/server/study/reviews";
import { finishSessionAction, overrideAction, refreshSessionAction, submitAnswerAction } from "@/app/(app)/reviews/actions";
import { cn } from "@/lib/utils";

interface Ask {
  subjectId: string;
  q: QuestionType;
}

interface Result {
  verdict: "correct" | "incorrect";
  feedback: Feedback;
  attemptId: string | null;
  completed: SubmitResult["completed"];
  overridden?: boolean;
  /** La lettura di questo elemento non è più da chiedere: si può ascoltare senza rivelare la risposta. */
  readingDone: boolean;
}

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function buildAsks(items: QueueItem[], priority: "balanced" | "meaning_first" | "reading_first"): Ask[] {
  const asks: Ask[] = [];
  const shuffled = [...items].sort(() => Math.random() - 0.5);
  for (const it of shuffled) {
    const order =
      priority === "meaning_first" ? it.pending : priority === "reading_first" ? [...it.pending].reverse() : [...it.pending].sort(() => Math.random() - 0.5);
    for (const q of order) asks.push({ subjectId: it.card.id, q });
  }
  // Distanzia le due domande dello stesso soggetto quando possibile.
  const out: Ask[] = [];
  const later: Ask[] = [];
  for (const a of asks) {
    if (out.length && out[out.length - 1]!.subjectId === a.subjectId) later.push(a);
    else out.push(a);
  }
  for (const a of later) out.splice(Math.min(out.length, Math.floor(Math.random() * 4) + out.findIndex((x) => x.subjectId === a.subjectId) + 2), 0, a);
  return out;
}

export function ReviewSession({
  initial,
  questionPriority,
  showRomajiHints,
}: {
  initial: SessionState;
  questionPriority: "balanced" | "meaning_first" | "reading_first";
  showRomajiHints: boolean;
}) {
  const router = useRouter();
  const isExtra = initial.kind === "extra_study";
  const [items, setItems] = useState(() => new Map(initial.items.map((i) => [i.card.id, i])));
  const [asks, setAsks] = useState<Ask[]>(() => buildAsks(initial.items, questionPriority));
  const [remaining, setRemaining] = useState(initial.remaining);
  const [result, setResult] = useState<Result | null>(null);
  const [retryFeedback, setRetryFeedback] = useState<Feedback | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [busy, startBusy] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [wrapUp, setWrapUp] = useState(false);
  const [stats, setStats] = useState({ correct: 0, incorrect: 0, up: 0, down: 0, done: 0 });
  const [lastTransition, setLastTransition] = useState<{ up: boolean; label: string } | null>(null);
  const [finished, setFinished] = useState(false);
  const [inputKey, setInputKey] = useState(0);
  const [autoplay, setAutoplay] = useAutoplayAudio();
  const shownAt = useRef(0);
  const touched = useRef(new Set<string>());

  const current = asks[0];
  const item = current ? items.get(current.subjectId) : undefined;

  useEffect(() => {
    shownAt.current = Date.now();
  }, [current?.subjectId, current?.q, inputKey]);

  const loadMore = useCallback(async () => {
    const state = await refreshSessionAction(initial.sessionId);
    if (state.items.length === 0 || wrapUp) {
      if (!isExtra || state.items.length === 0) {
        await finishSessionAction(initial.sessionId);
        setFinished(true);
        return;
      }
    }
    setItems(new Map(state.items.map((i) => [i.card.id, i])));
    setAsks(buildAsks(state.items, questionPriority));
    setRemaining(state.remaining);
  }, [initial.sessionId, isExtra, questionPriority, wrapUp]);

  const advance = useCallback(() => {
    if (!current || !result) return;
    const wrong = result.verdict === "incorrect" && !result.overridden;
    let next = asks.slice(1);
    if (wrong) next.splice(Math.min(next.length, 3 + Math.floor(Math.random() * 5)), 0, current);
    if (wrapUp) next = next.filter((a) => touched.current.has(a.subjectId));
    setAsks(next);
    if (next.length === 0) startBusy(loadMore);
    setResult(null);
    setRetryFeedback(null);
    setShowInfo(false);
    setLastTransition(null);
    setInputKey((k) => k + 1);
  }, [asks, current, result, wrapUp, loadMore]);

  const applyResult = useCallback(
    (subjectId: string, q: QuestionType, r: { completed: SubmitResult["completed"]; pending: QuestionType[] }, correct: boolean) => {
      if (r.completed) {
        const up = r.completed.nextStage > r.completed.previousStage;
        setLastTransition({ up, label: stageLabel(r.completed.nextStage as SrsStage) });
        setStats((s) => ({ ...s, up: s.up + (up ? 1 : 0), down: s.down + (up ? 0 : 1), done: s.done + 1 }));
        setRemaining((n) => Math.max(0, n - 1));
      } else if (isExtra && correct && r.pending.length === 0) {
        setStats((s) => ({ ...s, done: s.done + 1 }));
        setRemaining((n) => Math.max(0, n - 1));
      }
      setItems((prev) => {
        const copy = new Map(prev);
        const it = copy.get(subjectId);
        if (it) copy.set(subjectId, { ...it, pending: correct ? it.pending.filter((p) => p !== q) : it.pending });
        return copy;
      });
    },
    [isExtra],
  );

  const onSubmit = (answer: string) => {
    if (result) return advance();
    if (!current || !item || busy) return;
    setError(null);
    const clientAttemptId = newId();
    const responseTimeMs = Math.min(30 * 60_000, Date.now() - shownAt.current);
    startBusy(async () => {
      try {
        const r = await submitAnswerAction({
          sessionId: initial.sessionId,
          subjectId: current.subjectId,
          questionType: current.q,
          answer,
          clientAttemptId,
          responseTimeMs,
        });
        if (r.verdict === "retry") {
          // Nessun punteggio: il testo resta nel campo, a fuoco, pronto da correggere.
          setRetryFeedback(r.feedback);
          return;
        }
        touched.current.add(current.subjectId);
        setStats((s) => ({ ...s, correct: s.correct + (r.verdict === "correct" ? 1 : 0), incorrect: s.incorrect + (r.verdict === "incorrect" ? 1 : 0) }));
        const readingDone = current.q === "reading" || !r.pending.includes("reading");
        setResult({ verdict: r.verdict, feedback: r.feedback, attemptId: r.attemptId, completed: r.completed, readingDone });
        applyResult(current.subjectId, current.q, r, r.verdict === "correct");
        if (r.verdict === "incorrect") setShowInfo(true);
        // Mai prima della risposta alla lettura: l'audio la suggerirebbe.
        if (autoplay && readingDone && item.card.type !== "radical") speak(primaryReadingText(item.card));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Invio non riuscito: riprova (la risposta non verrà duplicata).");
      }
    });
  };

  const doOverride = (addAsSynonym: boolean) => {
    if (!result?.attemptId || !current || result.verdict !== "incorrect" || result.overridden) return;
    startBusy(async () => {
      try {
        const r = await overrideAction(result.attemptId!, addAsSynonym);
        setStats((s) => ({ ...s, correct: s.correct + 1, incorrect: Math.max(0, s.incorrect - 1) }));
        setResult({
          ...result,
          overridden: true,
          feedback: { tone: "warning", message: addAsSynonym ? "Corretta manualmente e aggiunta ai tuoi sinonimi." : "Risposta segnata come corretta manualmente." },
          completed: r.completed,
        });
        applyResult(current.subjectId, current.q, r, true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Correzione non riuscita");
      }
    });
  };

  // Dopo una domanda di significato la lettura è ancora da chiedere: niente audio finché non arriva.
  const canListen = !!result && !!item && item.card.type !== "radical" && result.readingDone;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!result) return;
      if (e.key === "Enter") {
        // Nel campo risposta è gestito dal form, sui pulsanti dal click nativo; altrove (es. dopo una correzione) avanza.
        const t = e.target as HTMLElement | null;
        if (t instanceof HTMLInputElement || t instanceof HTMLButtonElement || t instanceof HTMLAnchorElement) return;
        e.preventDefault();
        advance();
        return;
      }
      const k = e.key.toLowerCase();
      if (k === "f" || k === "i") {
        e.preventDefault();
        setShowInfo((v) => !v);
      } else if (k === "p" && canListen) {
        e.preventDefault();
        speak(primaryReadingText(item!.card));
      } else if (k === "o" && result.verdict === "incorrect" && !result.overridden) {
        e.preventDefault();
        doOverride(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const answerState: AnswerState = !result
    ? "idle"
    : result.overridden
      ? "warning"
      : result.verdict === "correct"
        ? result.feedback.tone === "warning"
          ? "warning"
          : "correct"
        : "incorrect";

  const accuracy = stats.correct + stats.incorrect === 0 ? null : Math.round((stats.correct / (stats.correct + stats.incorrect)) * 100);
  const progressPct = useMemo(() => {
    const total = initial.completed + initial.remaining;
    return total === 0 ? 100 : ((initial.completed + stats.done) / total) * 100;
  }, [initial.completed, initial.remaining, stats.done]);

  if (finished || (!current && !busy)) {
    return (
      <div className="mx-auto max-w-lg py-10 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-success/15 text-success">
          <Check aria-hidden />
        </span>
        <h1 className="mt-4 text-xl font-semibold">{isExtra ? "Studio extra completato" : "Ripassi completati"}</h1>
        <dl className="mx-auto mt-6 grid max-w-sm grid-cols-3 gap-3 text-center">
          <div className="rounded-md bg-surface p-3">
            <dt className="text-[11px] text-muted">Accuratezza</dt>
            <dd className="text-lg font-semibold">{accuracy === null ? "—" : `${accuracy}%`}</dd>
          </div>
          <div className="rounded-md bg-surface p-3">
            <dt className="text-[11px] text-muted">{isExtra ? "Completati" : "Saliti"}</dt>
            <dd className="text-lg font-semibold text-success">{isExtra ? stats.done : stats.up}</dd>
          </div>
          <div className="rounded-md bg-surface p-3">
            <dt className="text-[11px] text-muted">{isExtra ? "Errori" : "Scesi"}</dt>
            <dd className="text-lg font-semibold text-error">{isExtra ? stats.incorrect : stats.down}</dd>
          </div>
        </dl>
        <div className="mt-6 flex justify-center gap-3">
          <Button
            asChild
            onClick={() => {
              router.refresh();
            }}
          >
            <Link href="/">Dashboard</Link>
          </Button>
          <Button variant="secondary" asChild>
            <Link href="/lessons">Lezioni</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center gap-3">
        <Link href="/" className="rounded-md p-1.5 text-muted hover:bg-elevated hover:text-foreground" aria-label="Interrompi (i progressi sono salvati)">
          <X className="size-5" aria-hidden />
        </Link>
        <Progress value={progressPct} aria-label="Avanzamento ripassi" indicatorClassName={isExtra ? "bg-gold" : undefined} />
        <span className="whitespace-nowrap text-xs tabular-nums text-muted" title="Elementi ancora da completare">
          {remaining} rimasti
        </span>
        <span className="hidden whitespace-nowrap text-xs tabular-nums text-muted sm:inline">{accuracy === null ? "" : `${accuracy}%`}</span>
      </div>

      {isExtra && <p className="mb-3 text-center text-xs text-gold">Studio extra: le risposte non cambiano gli stadi SRS.</p>}

      {current && item ? (
        <Card className="overflow-hidden">
          <div className="relative py-10 text-center sm:py-14">
            <div
              className={cn("kanji-display", item.card.characters.length > 3 ? "text-6xl sm:text-7xl" : "text-8xl sm:text-9xl")}
              lang="ja"
              data-subject-id={item.card.id}
              data-question={current.q}
            >
              {item.card.characters}
            </div>
            {lastTransition && (
              <span
                className={cn(
                  "absolute right-3 top-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs",
                  lastTransition.up ? "bg-success/15 text-success" : "bg-error/15 text-error",
                )}
                role="status"
              >
                {lastTransition.up ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden />}
                {lastTransition.label}
              </span>
            )}
          </div>
          <QuestionBanner type={item.card.type} question={current.q} />
          <CardContent className="space-y-3 py-5">
            <AnswerInput key={`${current.subjectId}-${current.q}-${inputKey}`} mode={current.q} onSubmit={onSubmit} state={answerState} busy={busy && !result} />
            {showRomajiHints && current.q === "reading" && !result && (
              <p className="text-center text-xs text-muted">Scrivi in romaji (es. &quot;shiki&quot;, &quot;gakkou&quot;, &quot;n&apos;&quot; per ん davanti a vocale).</p>
            )}
            <p aria-live="polite" className={cn("min-h-5 text-center text-sm", feedbackColor(result?.feedback ?? retryFeedback))}>
              {(result?.feedback ?? retryFeedback)?.message}
            </p>
            {error && <p className="text-center text-sm text-error">{error}</p>}

            {result && (
              <div className="flex flex-wrap items-center justify-center gap-2">
                {canListen && <SpeakButton text={primaryReadingText(item.card)} size="sm" label="Ascolta la pronuncia (P)" />}
                <Button variant="secondary" size="sm" onClick={() => setShowInfo((v) => !v)} aria-expanded={showInfo}>
                  <Info aria-hidden /> Dettagli <Kbd className="ml-1">F</Kbd>
                </Button>
                {result.verdict === "incorrect" && !result.overridden && (
                  <>
                    <Button variant="outline" size="sm" onClick={() => doOverride(false)} disabled={busy}>
                      Era giusta <Kbd className="ml-1">O</Kbd>
                    </Button>
                    {current.q === "meaning" && (
                      <Button variant="ghost" size="sm" onClick={() => doOverride(true)} disabled={busy}>
                        Era giusta e aggiungi come sinonimo
                      </Button>
                    )}
                  </>
                )}
                <Button size="sm" onClick={advance}>
                  Avanti <Kbd className="ml-1 border-on-primary/30 bg-transparent text-on-primary/80">Invio</Kbd>
                </Button>
              </div>
            )}

            {result && showInfo && (
              <div className="space-y-5 border-t border-border/60 pt-5">
                {current.q === "meaning" ? (
                  <>
                    <MeaningSection card={item.card} />
                    <MnemonicSection card={item.card} type="meaning" />
                  </>
                ) : (
                  <>
                    <ReadingSection card={item.card} />
                    <MnemonicSection card={item.card} type="reading" />
                  </>
                )}
                <RelatedSection card={item.card} />
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <p className="py-16 text-center text-sm text-muted">Caricamento…</p>
      )}

      <div className="mt-4 flex items-center justify-between text-xs text-muted">
        <button
          onClick={() => setWrapUp((w) => !w)}
          className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-elevated", wrapUp && "text-gold")}
          aria-pressed={wrapUp}
        >
          <Pause className="size-3.5" aria-hidden />
          {wrapUp ? "Chiusura: finisco solo gli elementi iniziati" : "Termina dopo quelli iniziati"}
        </button>
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 hover:bg-elevated">
          <input type="checkbox" checked={autoplay} onChange={(e) => setAutoplay(e.target.checked)} className="accent-primary" />
          Audio automatico
        </label>
        <span className="hidden sm:inline">
          <Kbd>Invio</Kbd> conferma · <Kbd>F</Kbd> dettagli · <Kbd>P</Kbd> ascolta
        </span>
      </div>
    </div>
  );
}

function primaryReadingText(card: { readings: { reading: string; isPrimary: boolean }[] }) {
  const r = card.readings.find((x) => x.isPrimary) ?? card.readings[0];
  return r ? speakableReading(r.reading) : "";
}
