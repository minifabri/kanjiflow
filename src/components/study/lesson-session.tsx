"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Kbd, Progress } from "@/components/ui/misc";
import { AnswerInput, type AnswerState } from "./answer-input";
import { QuestionBanner } from "./question-banner";
import {
  ExamplesSection,
  MeaningSection,
  MnemonicSection,
  ReadingSection,
  RelatedSection,
  SubjectHero,
} from "./subject-sections";
import { meaningFeedback, readingFeedback, validateMeaning, validateReading, type Feedback, type TypoTolerance } from "@/domain/answers";
import { requiredQuestions, type QuestionType } from "@/domain/srs";
import { completeLessonsAction } from "@/app/(app)/lessons/actions";
import type { SubjectCardDTO } from "@/server/study/subjects";
import { cn } from "@/lib/utils";

type Section = "overview" | "mnemonic" | "reading" | "related" | "examples";
const SECTION_LABEL: Record<Section, string> = {
  overview: "Significato",
  mnemonic: "Mnemonico",
  reading: "Lettura",
  related: "Collegamenti",
  examples: "Esempi",
};

function sectionsFor(card: SubjectCardDTO): Section[] {
  const s: Section[] = ["overview", "mnemonic"];
  if (card.type !== "radical") s.push("reading");
  s.push("related");
  if (card.examples.length > 0) s.push("examples");
  return s;
}

interface QuizItem {
  card: SubjectCardDTO;
  q: QuestionType;
  key: string;
}

export function LessonSession({
  cards,
  typoTolerance,
  readingFirst,
  moreAvailable,
}: {
  cards: SubjectCardDTO[];
  typoTolerance: TypoTolerance;
  readingFirst: boolean;
  moreAvailable: boolean;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<"learn" | "quiz" | "done">("learn");
  const [cardIdx, setCardIdx] = useState(0);
  const [secIdx, setSecIdx] = useState(0);
  const card = cards[cardIdx]!;
  const sections = useMemo(() => sectionsFor(card), [card]);
  const section = sections[secIdx]!;

  const next = useCallback(() => {
    if (secIdx < sections.length - 1) setSecIdx(secIdx + 1);
    else if (cardIdx < cards.length - 1) {
      setCardIdx(cardIdx + 1);
      setSecIdx(0);
    } else setPhase("quiz");
  }, [secIdx, sections.length, cardIdx, cards.length]);

  const prev = useCallback(() => {
    if (secIdx > 0) setSecIdx(secIdx - 1);
    else if (cardIdx > 0) {
      const prevSections = sectionsFor(cards[cardIdx - 1]!);
      setCardIdx(cardIdx - 1);
      setSecIdx(prevSections.length - 1);
    }
  }, [secIdx, cardIdx, cards]);

  useEffect(() => {
    if (phase !== "learn") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowRight" || e.key === "Enter" || e.key === "l") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft" || e.key === "h") {
        e.preventDefault();
        prev();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, next, prev]);

  if (phase === "quiz") {
    return <LessonQuiz cards={cards} typoTolerance={typoTolerance} readingFirst={readingFirst} onDone={() => setPhase("done")} onBack={() => setPhase("learn")} />;
  }
  if (phase === "done") {
    return (
      <div className="mx-auto max-w-lg py-10 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-success/15 text-success">
          <Check aria-hidden />
        </span>
        <h1 className="mt-4 text-xl font-semibold">Lezioni completate</h1>
        <p className="mt-2 text-sm text-muted">
          {cards.length} {cards.length === 1 ? "elemento è entrato" : "elementi sono entrati"} in Apprendista 1: il primo ripasso arriva tra circa 4 ore.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          {moreAvailable && (
            <Button
              onClick={() => {
                router.refresh();
                router.push("/lessons/session");
              }}
            >
              Altre lezioni
            </Button>
          )}
          <Button variant="secondary" asChild>
            <Link href="/">Dashboard</Link>
          </Button>
        </div>
      </div>
    );
  }

  const total = cards.reduce((a, c) => a + sectionsFor(c).length, 0);
  const done = cards.slice(0, cardIdx).reduce((a, c) => a + sectionsFor(c).length, 0) + secIdx;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center gap-3">
        <Link href="/lessons" className="rounded-md p-1.5 text-muted hover:bg-elevated hover:text-foreground" aria-label="Esci dalla sessione">
          <X className="size-5" aria-hidden />
        </Link>
        <Progress value={(done / total) * 100} aria-label="Avanzamento lezioni" />
        <span className="text-xs tabular-nums text-muted">
          {cardIdx + 1}/{cards.length}
        </span>
      </div>

      <div className="mb-4 flex justify-center gap-1.5" aria-hidden>
        {cards.map((c, i) => (
          <button
            key={c.id}
            tabIndex={-1}
            onClick={() => {
              setCardIdx(i);
              setSecIdx(0);
            }}
            className={cn("kanji-display rounded-md px-2 py-1 text-sm text-muted", i === cardIdx && "bg-elevated text-foreground")}
          >
            {c.characters}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="space-y-6 py-6 sm:py-8">
          <SubjectHero card={card} />
          <nav className="flex flex-wrap justify-center gap-1" aria-label="Sezioni della lezione">
            {sections.map((s, i) => (
              <button
                key={s}
                onClick={() => setSecIdx(i)}
                aria-current={i === secIdx ? "step" : undefined}
                className={cn("rounded-full px-3 py-1 text-xs text-muted hover:text-foreground", i === secIdx && "bg-elevated text-foreground")}
              >
                {SECTION_LABEL[s]}
              </button>
            ))}
          </nav>
          <div className="min-h-40">
            {section === "overview" && <MeaningSection card={card} />}
            {section === "mnemonic" && (
              <div className="space-y-6">
                <MnemonicSection card={card} type="meaning" />
                {card.type !== "radical" && <MnemonicSection card={card} type="reading" />}
              </div>
            )}
            {section === "reading" && <ReadingSection card={card} />}
            {section === "related" &&
              (card.components.length + card.usedIn.length > 0 ? (
                <RelatedSection card={card} />
              ) : (
                <p className="text-sm text-muted">Nessun collegamento nel dataset attuale.</p>
              ))}
            {section === "examples" && <ExamplesSection card={card} />}
          </div>
        </CardContent>
      </Card>

      <div className="mt-5 flex items-center justify-between">
        <Button variant="ghost" onClick={prev} disabled={cardIdx === 0 && secIdx === 0}>
          <ArrowLeft aria-hidden /> Indietro
        </Button>
        <p className="hidden text-xs text-muted sm:block">
          <Kbd>←</Kbd> <Kbd>→</Kbd> o <Kbd>Invio</Kbd> per navigare
        </p>
        <Button onClick={next}>
          {cardIdx === cards.length - 1 && secIdx === sections.length - 1 ? "Al quiz" : "Avanti"} <ArrowRight aria-hidden />
        </Button>
      </div>
    </div>
  );
}

function LessonQuiz({
  cards,
  typoTolerance,
  readingFirst,
  onDone,
  onBack,
}: {
  cards: SubjectCardDTO[];
  typoTolerance: TypoTolerance;
  readingFirst: boolean;
  onDone: () => void;
  onBack: () => void;
}) {
  const initial = useMemo<QuizItem[]>(() => {
    const items: QuizItem[] = [];
    for (const c of cards) {
      const req = requiredQuestions(c.type, c.readings.some((r) => r.isAccepted));
      const ordered = readingFirst ? [...req].reverse() : req;
      for (const q of ordered) items.push({ card: c, q, key: `${c.id}-${q}` });
    }
    // Mescola mantenendo l'ordine relativo delle domande di uno stesso soggetto.
    return items
      .map((it, i) => ({ it, r: Math.random() + (it.q === (readingFirst ? "meaning" : "reading") ? 0.5 : 0) + i * 0.0001 }))
      .sort((a, b) => a.r - b.r)
      .map((x) => x.it);
  }, [cards, readingFirst]);

  const [queue, setQueue] = useState(initial);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [state, setState] = useState<AnswerState>("idle");
  const [attemptKey, setAttemptKey] = useState(0);
  const [saving, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const current = queue[0];

  const finish = useCallback(() => {
    startSaving(async () => {
      try {
        await completeLessonsAction(cards.map((c) => c.id));
        onDone();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Salvataggio non riuscito");
      }
    });
  }, [cards, onDone]);

  if (!current) {
    return (
      <div className="mx-auto max-w-lg py-10 text-center">
        <p className="text-lg font-medium">Quiz superato</p>
        <p className="mt-2 text-sm text-muted">Salva per inserire gli elementi nel ciclo di ripasso.</p>
        {error && <p className="mt-3 text-sm text-error">{error}</p>}
        <Button className="mt-6" onClick={finish} disabled={saving} autoFocus>
          {saving ? "Salvataggio…" : "Completa le lezioni"}
        </Button>
      </div>
    );
  }

  const onSubmit = (answer: string) => {
    if (state !== "idle") {
      // Avanza: le risposte sbagliate tornano in fondo alla coda.
      setQueue((q) => (state === "incorrect" ? [...q.slice(1), q[0]!] : q.slice(1)));
      setFeedback(null);
      setState("idle");
      setAttemptKey((k) => k + 1);
      return;
    }
    if (current.q === "meaning") {
      const v = validateMeaning(answer, { meanings: current.card.meanings, typoTolerance });
      setFeedback(meaningFeedback(v));
      if (v.verdict === "retry") return;
      setState(v.verdict === "correct" ? (v.outcome === "typo" || v.outcome === "accent" ? "warning" : "correct") : "incorrect");
    } else {
      const v = validateReading(answer, { subjectType: current.card.type === "kanji" ? "kanji" : "vocabulary", readings: current.card.readings });
      setFeedback(readingFeedback(v));
      if (v.verdict === "retry") return;
      setState(v.verdict === "correct" ? "correct" : "incorrect");
    }
  };

  const remaining = new Set(queue.map((q) => q.key)).size;
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center gap-3">
        <button onClick={onBack} className="rounded-md p-1.5 text-muted hover:bg-elevated hover:text-foreground" aria-label="Torna alle lezioni">
          <ArrowLeft className="size-5" aria-hidden />
        </button>
        <Progress value={((initial.length - remaining) / initial.length) * 100} aria-label="Avanzamento quiz" />
        <span className="text-xs tabular-nums text-muted">{remaining} rimaste</span>
      </div>
      <Card className="overflow-hidden">
        <div className="py-10 text-center">
          <div className="kanji-display text-7xl sm:text-8xl" lang="ja">
            {current.card.characters}
          </div>
        </div>
        <QuestionBanner type={current.card.type} question={current.q} />
        <CardContent className="space-y-3 py-5">
          <AnswerInput key={`${current.key}-${attemptKey}`} mode={current.q} onSubmit={onSubmit} state={state} />
          <p aria-live="polite" className={cn("min-h-5 text-center text-sm", feedbackColor(feedback))}>
            {feedback?.message}
          </p>
          {state !== "idle" && (
            <div className="rounded-md bg-elevated/60 p-3 text-center text-sm">
              {current.q === "meaning" ? (
                <span className="capitalize">{current.card.primaryMeaning}</span>
              ) : (
                <span className="jp">
                  {current.card.readings
                    .filter((r) => r.isPrimary)
                    .map((r) => r.reading.replace(/\./g, ""))
                    .join("、")}
                </span>
              )}
              <span className="ml-2 text-xs text-muted">· Invio per continuare</span>
            </div>
          )}
        </CardContent>
      </Card>
      <p className="mt-3 text-center text-xs text-muted">Quiz di acquisizione: non influisce sullo SRS, serve solo a fissare gli elementi appena visti.</p>
    </div>
  );
}

export function feedbackColor(f: Feedback | null) {
  if (!f) return "";
  return f.tone === "success" ? "text-success" : f.tone === "error" ? "text-error" : f.tone === "warning" ? "text-gold" : "text-muted";
}
