"use client";

/**
 * Sessione di grammatica: lezioni (scheda, poi un esercizio da superare), ripassi SRS e pratica libera.
 * Le soluzioni arrivano dal server solo dopo la risposta. Tastiera: 1–4 per rispondere, Invio per continuare.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, Kbd, Progress } from "@/components/ui/misc";
import { RubyText } from "@/components/reading/ruby-text";
import { SpeakButton } from "@/components/study/speak-button";
import { answerGrammarAction } from "@/app/(app)/grammar/actions";
import { kanaText, plainText } from "@/domain/reading/markup";
import { furiganaRule, type FuriganaMode, type KanjiState } from "@/domain/reading/readability";
import { stageLabel, type SrsStage } from "@/domain/srs/stages";
import type { GrammarAnswerResult, GrammarMode, GrammarSessionItem } from "@/server/grammar/points";
import { cn } from "@/lib/utils";
import { GrammarSheet } from "./grammar-sheet";

interface QueueEntry {
  item: GrammarSessionItem;
  /** Indice dell'esercizio da proporre (lezioni: avanza dopo un errore). */
  question: number;
  /** Nelle lezioni la scheda si mostra prima del primo esercizio. */
  showSheet: boolean;
}

interface Outcome {
  slug: string;
  title: string;
  correct: boolean;
  nextStage: number | null;
}

const MODE_TITLE: Record<GrammarMode, string> = { lesson: "Nuovi punti", review: "Ripassi di grammatica", practice: "Pratica libera" };
const KIND_LABEL = { choice: "Scegli la forma corretta", order: "Riordina: quale pezzo va alla ★?" } as const;

function newAttemptId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}-attempt`;
}

export function GrammarSession({
  mode,
  items,
  kanjiStates,
  defaultFurigana,
}: {
  mode: GrammarMode;
  items: GrammarSessionItem[];
  kanjiStates: Record<string, KanjiState>;
  defaultFurigana: FuriganaMode;
}) {
  const [queue, setQueue] = useState<QueueEntry[]>(() =>
    mode === "practice"
      ? items.flatMap((item) => item.questions.map((_, question) => ({ item, question, showSheet: false })))
      : items.map((item) => ({ item, question: 0, showSheet: mode === "lesson" })),
  );
  const [total] = useState(queue.length);
  const [done, setDone] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  const [attemptId, setAttemptId] = useState(newAttemptId);
  const [result, setResult] = useState<GrammarAnswerResult | null>(null);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const furigana = useMemo(() => furiganaRule(defaultFurigana, kanjiStates), [defaultFurigana, kanjiStates]);

  const entry = queue[0];
  const question = entry?.item.questions[entry.question];

  const answer = useCallback(
    (index: number) => {
      if (!entry || !question || result || pending) return;
      setChosen(index);
      setError(null);
      startTransition(async () => {
        try {
          setResult(await answerGrammarAction({ clientAttemptId: attemptId, exerciseId: question.id, chosenIndex: index, mode }));
        } catch {
          setChosen(null);
          setError("Non sono riuscito a registrare la risposta. Controlla la connessione e riprova.");
        }
      });
    },
    [attemptId, entry, mode, pending, question, result],
  );

  // Invio e clic possono arrivare insieme: ogni risposta fa avanzare la coda una volta sola.
  const advancedFor = useRef<string | null>(null);
  const advance = useCallback(() => {
    if (!entry || !result || advancedFor.current === attemptId) return;
    advancedFor.current = attemptId;
    const [, ...rest] = queue;
    // Lezione non superata: il punto torna in fondo con un altro esercizio e la scheda da rileggere.
    const retry = mode === "lesson" && !result.correct;
    if (retry) {
      setQueue([...rest, { item: entry.item, question: (entry.question + 1) % entry.item.questions.length, showSheet: true }]);
    } else {
      setQueue(rest);
      setDone((d) => d + 1);
      setOutcomes((o) => [...o, { slug: entry.item.sheet.slug, title: plainText(entry.item.sheet.title), correct: result.correct, nextStage: result.nextStage }]);
    }
    setResult(null);
    setChosen(null);
    setAttemptId(newAttemptId());
    window.scrollTo({ top: 0 });
  }, [attemptId, entry, mode, queue, result]);

  const startQuestion = useCallback(() => {
    setQueue((q) => (q[0] ? [{ ...q[0], showSheet: false }, ...q.slice(1)] : q));
    window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (!entry) return;
      if (e.key === "Enter") {
        if (!entry.showSheet && !result) return;
        e.preventDefault();
        if (entry.showSheet) startQuestion();
        else advance();
      } else if (!entry.showSheet && !result && ["1", "2", "3", "4"].includes(e.key)) {
        answer(Number(e.key) - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [advance, answer, entry, result, startQuestion]);

  if (!entry || !question) {
    const right = outcomes.filter((o) => o.correct).length;
    return (
      <Card>
        <CardContent className="space-y-5 py-8 text-center">
          <h1 className="text-xl font-semibold">{outcomes.length === 0 ? "Niente da fare per ora" : "Sessione completata"}</h1>
          {outcomes.length > 0 && (
            <>
              <p className="text-sm text-muted" role="status">
                {mode === "lesson"
                  ? `${outcomes.length} ${outcomes.length === 1 ? "punto nuovo entra" : "punti nuovi entrano"} nei ripassi: il primo tra circa 4 ore.`
                  : `${right} su ${outcomes.length} ${outcomes.length === 1 ? "risposta corretta" : "risposte corrette"}.`}
              </p>
              <ul className="mx-auto max-w-md space-y-1.5 text-left">
                {outcomes.map((o, i) => (
                  <li key={i}>
                    <Link href={`/grammar/${o.slug}`} className="flex items-center justify-between gap-3 rounded-md bg-elevated/50 px-3 py-2 hover:bg-elevated">
                      <span className="jp text-sm" lang="ja">
                        {o.title}
                      </span>
                      <span className="flex items-center gap-2">
                        {o.nextStage !== null && <span className="text-[11px] text-muted">{stageLabel(o.nextStage as SrsStage)}</span>}
                        {o.correct ? <Check className="size-4 text-success" aria-label="corretto" /> : <X className="size-4 text-error" aria-label="sbagliato" />}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild>
              <Link href="/grammar">Torna alla grammatica</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/">Dashboard</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { sheet } = entry.item;
  const stageChange = result && result.previousStage !== null && result.nextStage !== null ? { from: result.previousStage, to: result.nextStage } : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="shrink-0 text-xs text-muted">{MODE_TITLE[mode]}</span>
        <Progress value={total ? (done / total) * 100 : 0} className="h-1.5" aria-label="Avanzamento della sessione" />
        <span className="shrink-0 text-xs tabular-nums text-muted">
          {done}/{total}
        </span>
      </div>

      {entry.showSheet ? (
        <Card>
          <CardContent className="space-y-6 py-6 sm:py-8">
            <div className="flex justify-center gap-2">
              <Badge variant="primary">{sheet.level}</Badge>
              <Badge variant="outline">Punto nuovo</Badge>
            </div>
            <GrammarSheet sheet={sheet} furigana={furigana} />
            <div className="flex flex-col items-center gap-2">
              <Button size="lg" onClick={startQuestion}>
                Ho capito, mettimi alla prova
              </Button>
              <span className="hidden text-xs text-muted sm:inline">
                <Kbd>Invio</Kbd> per continuare
              </span>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="space-y-5 pb-6 pt-5 sm:pt-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-muted">{KIND_LABEL[question.kind]}</span>
              {entry.item.stage !== null && entry.item.stage > 0 && <Badge variant="outline">{stageLabel(entry.item.stage as SrsStage)}</Badge>}
            </div>
            <p className="text-center text-[21px] leading-[2.4] sm:text-2xl sm:leading-[2.4]" data-testid="grammar-prompt" data-exercise={question.id}>
              <RubyText segments={result ? result.solution : question.prompt} furigana={furigana} />
            </p>
            <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Risposte">
              {question.choices.map((c, i) => {
                const isAnswer = result?.answerIndex === i;
                const isChosen = chosen === i;
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={!!result || pending}
                    onClick={() => answer(i)}
                    className={cn(
                      "flex items-center gap-3 rounded-md border border-border px-3 py-3 text-left text-[17px] leading-loose transition-colors enabled:hover:bg-elevated disabled:cursor-default",
                      !result && isChosen && "border-primary bg-primary/10",
                      result && isAnswer && "border-success/60 bg-success/10",
                      result && isChosen && !isAnswer && "border-error/60 bg-error/10",
                    )}
                  >
                    <span className="grid size-6 shrink-0 place-items-center rounded-full border border-border text-xs text-muted" aria-hidden>
                      {result && isAnswer ? <Check className="size-3.5 text-success" /> : result && isChosen ? <X className="size-3.5 text-error" /> : i + 1}
                    </span>
                    <span>
                      <RubyText segments={c} furigana={furigana} />
                      {result && isAnswer && <span className="sr-only"> (risposta corretta)</span>}
                    </span>
                  </button>
                );
              })}
            </div>
            {error && (
              <p className="text-sm text-error" role="alert">
                {error}
              </p>
            )}

            {result && (
              <div className="space-y-3">
                <div className={cn("rounded-md p-3 text-sm leading-relaxed", result.correct ? "bg-success/10" : "bg-error/10")} role="status">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className={cn("font-medium", result.correct ? "text-success" : "text-error")}>{result.correct ? "Corretto" : "Non corretto"}</p>
                      <p className="mt-1 text-muted">{result.translation}</p>
                      <p className="mt-1">{result.explanation}</p>
                    </div>
                    <SpeakButton text={kanaText(result.solution)} size="sm" className="shrink-0" />
                  </div>
                  {stageChange && (
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
                      {stageChange.to > stageChange.from ? <ArrowUp className="size-3.5 text-success" aria-hidden /> : <ArrowDown className="size-3.5 text-error" aria-hidden />}
                      {stageChange.from === 0 ? "Entra nei ripassi: " : `${stageLabel(stageChange.from as SrsStage)} → `}
                      {stageLabel(stageChange.to as SrsStage)}
                    </p>
                  )}
                  {mode === "lesson" && !result.correct && <p className="mt-2 text-xs text-muted">Rivedrai la scheda e un altro esercizio alla fine della sessione.</p>}
                </div>
                {(mode !== "lesson" || !result.correct) && (
                  <details className="rounded-md border border-border/60 px-3 py-2">
                    <summary className="cursor-pointer text-xs text-muted">Rivedi la scheda di {plainText(sheet.title)}</summary>
                    <div className="pt-4">
                      <GrammarSheet sheet={sheet} furigana={furigana} />
                    </div>
                  </details>
                )}
                <div className="flex items-center gap-3">
                  <Button size="lg" onClick={advance}>
                    Avanti
                  </Button>
                  <span className="hidden text-xs text-muted sm:inline">
                    <Kbd>Invio</Kbd>
                  </span>
                </div>
              </div>
            )}
            {!result && (
              <p className="hidden text-center text-xs text-muted sm:block">
                <Kbd>1</Kbd>–<Kbd>4</Kbd> per rispondere
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
