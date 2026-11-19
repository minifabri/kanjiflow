"use client";

/**
 * Testo con spazi vuoti (文章の文法): si legge il testo, si sceglie la forma giusta per ogni spazio
 * numerato e si consegna. Gli spazi nel testo si riempiono con la risposta scelta; dopo la consegna
 * mostrano quella corretta. La correzione avviene sul server: la pagina non contiene le soluzioni.
 * È pratica: non modifica gli stadi SRS.
 */
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/misc";
import { RubyText } from "@/components/reading/ruby-text";
import { SpeakButton } from "@/components/study/speak-button";
import { submitGrammarTextAction } from "@/app/(app)/grammar/actions";
import { splitBlanks } from "@/domain/grammar/text";
import { kanaText, plainText } from "@/domain/reading/markup";
import { furiganaRule, type FuriganaMode } from "@/domain/reading/readability";
import { stageLabel, type SrsStage } from "@/domain/srs/stages";
import type { GrammarTextDetail, GrammarTextResult } from "@/server/grammar/texts";
import { cn } from "@/lib/utils";

const MODE_LABEL: Record<FuriganaMode, string> = { adaptive: "Adattivo", always: "Sempre", never: "Mai" };

type BlankState = "empty" | "filled" | "right" | "wrong";

function BlankBox({ number, label, state, onClick, children }: { number: number; label: string; state: BlankState; onClick: () => void; children?: ReactNode }) {
  return (
    <button
      type="button"
      data-testid={`blank-${number}`}
      data-state={state}
      onClick={onClick}
      aria-label={label}
      className={cn(
        "mx-1 inline-flex min-w-16 items-center justify-center gap-1.5 rounded-md border px-2 py-0.5 align-baseline text-[0.9em] leading-normal transition-colors",
        state === "empty" && "border-dashed border-primary/60 bg-primary/5 text-muted hover:bg-primary/10",
        state === "filled" && "border-primary bg-primary/15 text-foreground",
        state === "right" && "border-success/60 bg-success/10 text-foreground",
        state === "wrong" && "border-error/60 bg-error/10 text-foreground",
      )}
    >
      <span className="text-[0.7em] tabular-nums text-muted" aria-hidden>
        {number}
      </span>
      {children}
    </button>
  );
}

export function GrammarTextSession({
  text,
  defaultFurigana,
  nextSlug,
}: {
  text: Omit<GrammarTextDetail, "lastAttempt">;
  defaultFurigana: FuriganaMode;
  nextSlug: string | null;
}) {
  const [mode, setMode] = useState<FuriganaMode>(defaultFurigana);
  const [answers, setAnswers] = useState<(number | null)[]>(() => text.blanks.map(() => null));
  const [result, setResult] = useState<GrammarTextResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const startedAt = useRef(0);
  useEffect(() => {
    startedAt.current = Date.now();
  }, []);
  const furigana = useMemo(() => furiganaRule(mode, text.kanjiStates), [mode, text.kanjiStates]);

  const allAnswered = answers.every((a) => a !== null);

  function focusQuestion(number: number) {
    const el = document.getElementById(`blank-q-${number}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.focus({ preventScroll: true });
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        setResult(await submitGrammarTextAction({ textId: text.id, answers, durationMs: Date.now() - startedAt.current }));
        document.getElementById("risultato")?.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch {
        setError("Non sono riuscito a registrare le risposte. Controlla la connessione e riprova.");
      }
    });
  }

  function restart() {
    setAnswers(text.blanks.map(() => null));
    setResult(null);
    startedAt.current = Date.now();
    window.scrollTo({ top: 0 });
  }

  /** Testo del brano con le risposte corrette al posto degli spazi, per l'ascolto dopo la consegna. */
  const completeKana = result
    ? text.paragraphs
        .map((p) =>
          splitBlanks(p)
            .map((part) =>
              part.kind === "blank" ? kanaText(text.blanks[part.number - 1]?.choices[result.blanks[part.number - 1]!.answerIndex] ?? []) : kanaText([part.segment]),
            )
            .join(""),
        )
        .join("\n")
    : "";

  const weak = result
    ? [...new Map(result.blanks.filter((b) => !b.correct && b.point).map((b) => [b.point!.slug, b.point!])).values()]
    : [];

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-xl font-medium leading-relaxed sm:text-2xl">
              <RubyText segments={text.title} furigana={furigana} />
            </h1>
            {result && <SpeakButton text={completeKana} label="Ascolta il testo completo" />}
          </div>
          <CardDescription>{text.titleIt}</CardDescription>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="inline-flex rounded-md border border-border p-0.5" role="group" aria-label="Furigana">
              {(Object.keys(MODE_LABEL) as FuriganaMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  aria-pressed={mode === m}
                  className={cn("rounded-sm px-2.5 py-1 text-xs text-muted transition-colors", mode === m && "bg-elevated text-foreground")}
                >
                  {MODE_LABEL[m]}
                </button>
              ))}
            </div>
            <span className="text-xs text-muted">Leggi il testo e scegli la forma giusta per ogni spazio numerato.</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-5 pb-6 pt-3 text-[19px] leading-[2.6] sm:text-xl sm:leading-[2.7]">
          {text.paragraphs.map((p, pi) => (
            <p key={pi} className="whitespace-pre-line">
              {splitBlanks(p).map((part, i) => {
                if (part.kind === "segment") return <RubyText key={i} segments={[part.segment]} furigana={furigana} />;
                const n = part.number;
                const chosen = answers[n - 1] ?? null;
                const graded = result?.blanks[n - 1];
                const shown = graded ? graded.answerIndex : chosen;
                const state: BlankState = graded ? (graded.correct ? "right" : "wrong") : chosen !== null ? "filled" : "empty";
                const choice = shown !== null ? text.blanks[n - 1]?.choices[shown] : undefined;
                const label = choice
                  ? `Spazio ${n}: ${plainText(choice)}${graded ? (graded.correct ? ", corretto" : ", sbagliato: la risposta giusta è questa") : ", scelta attuale"}`
                  : `Spazio ${n}, vuoto`;
                return (
                  <BlankBox key={i} number={n} label={label} state={state} onClick={() => focusQuestion(n)}>
                    {choice ? <RubyText segments={choice} furigana={furigana} /> : <span aria-hidden>　　</span>}
                  </BlankBox>
                );
              })}
            </p>
          ))}
        </CardContent>
      </Card>

      <section className="space-y-4" aria-label="Domande">
        {result && (
          <Card id="risultato" className={cn("scroll-mt-20", result.correctCount === result.totalCount ? "border-success/40" : "border-gold/40")}>
            <CardContent className="space-y-3 pt-4 sm:pt-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-lg font-medium" role="status">
                  {result.correctCount} su {result.totalCount} {result.totalCount === 1 ? "risposta corretta" : "risposte corrette"}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={restart}>
                    <RotateCcw aria-hidden /> Rifai
                  </Button>
                  {nextSlug && (
                    <Button asChild size="sm">
                      <Link href={`/grammar/text/${nextSlug}`}>Prossimo testo →</Link>
                    </Button>
                  )}
                </div>
              </div>
              {weak.length > 0 && (
                <div>
                  <p className="text-xs text-muted">Punti da rivedere</p>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {weak.map((w) => (
                      <li key={w.slug}>
                        <Link
                          href={`/grammar/${w.slug}`}
                          target="_blank"
                          className="jp inline-flex items-center gap-2 rounded-md bg-gold/15 px-2.5 py-1.5 text-sm text-gold hover:bg-gold/25"
                          lang="ja"
                        >
                          {plainText(w.title)}
                          <span className="font-sans text-[11px] opacity-80">{w.stage !== null ? stageLabel(w.stage as SrsStage) : "da studiare"}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="text-xs text-muted">Questo esercizio è pratica: non modifica gli stadi SRS dei punti grammaticali.</p>
            </CardContent>
          </Card>
        )}

        {text.blanks.map((b, bi) => {
          const n = bi + 1;
          const graded = result?.blanks[bi];
          return (
            <Card key={b.id}>
              <CardContent className="pt-4 sm:pt-5">
                <fieldset disabled={!!result} id={`blank-q-${n}`} tabIndex={-1} className="outline-none focus-visible:outline-2 focus-visible:outline-ring">
                  <legend className="flex items-center gap-2 text-[17px] leading-loose">
                    <span className="rounded-md border border-border px-2 py-0.5 text-sm tabular-nums">{n}</span>
                    {graded && <Badge variant={graded.correct ? "success" : "error"}>{graded.correct ? "corretto" : "sbagliato"}</Badge>}
                  </legend>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {b.choices.map((c, ci) => {
                      const chosen = answers[bi] === ci;
                      const isAnswer = graded?.answerIndex === ci;
                      return (
                        <label
                          key={ci}
                          className={cn(
                            "flex cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-2.5 text-[17px] leading-loose transition-colors hover:bg-elevated",
                            !graded && chosen && "border-primary bg-primary/10",
                            graded && "cursor-default hover:bg-transparent",
                            graded && isAnswer && "border-success/60 bg-success/10",
                            graded && chosen && !isAnswer && "border-error/60 bg-error/10",
                          )}
                        >
                          <input
                            type="radio"
                            name={`blank-${b.id}`}
                            className="sr-only"
                            checked={chosen}
                            onChange={() => setAnswers((prev) => prev.map((a, i) => (i === bi ? ci : a)))}
                          />
                          <span
                            className={cn(
                              "grid size-6 shrink-0 place-items-center rounded-full border border-border text-xs text-muted",
                              !graded && chosen && "border-primary bg-primary text-on-primary",
                            )}
                            aria-hidden
                          >
                            {ci + 1}
                          </span>
                          <span>
                            <RubyText segments={c} furigana={furigana} />
                            {graded && isAnswer && <span className="sr-only"> (risposta corretta)</span>}
                            {graded && chosen && !isAnswer && <span className="sr-only"> (la tua risposta, sbagliata)</span>}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
                {graded && (
                  <div className="mt-3 space-y-2 rounded-md bg-elevated/60 p-3 text-sm leading-relaxed">
                    <p>
                      <span className={cn("font-medium", graded.correct ? "text-success" : "text-error")}>{graded.correct ? "Corretto. " : "Non corretto. "}</span>
                      {graded.explanation}
                    </p>
                    {graded.point && (
                      <p className="text-xs text-muted">
                        Verifica:{" "}
                        <Link href={`/grammar/${graded.point.slug}`} target="_blank" className="jp text-secondary hover:underline" lang="ja">
                          {plainText(graded.point.title)}
                        </Link>
                        {" · "}
                        {graded.point.stage !== null ? stageLabel(graded.point.stage as SrsStage) : "non ancora studiato"}
                        {!graded.correct && " · rivedi la scheda"}
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}

        {!result && (
          <div className="flex flex-wrap items-center gap-3">
            <Button size="lg" onClick={submit} disabled={pending || !allAnswered}>
              Controlla le risposte
            </Button>
            {!allAnswered && (
              <span className="text-xs text-muted">
                Rispondi a tutti gli spazi per continuare ({answers.filter((a) => a !== null).length}/{answers.length}).
              </span>
            )}
          </div>
        )}
        {error && (
          <p className="text-sm text-error" role="alert">
            {error}
          </p>
        )}
      </section>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle>Traduzione</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-relaxed text-muted">
            {result.translation.map((t, i) => (
              <p key={i}>{t}</p>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
