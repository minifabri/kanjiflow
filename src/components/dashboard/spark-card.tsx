"use client";

/**
 * Stimolo della dashboard: una domanda a scelta multipla da risolvere con un tocco (o con i tasti 1–4).
 * La correzione è immediata, senza attendere il server; la risposta viene registrata in sottofondo.
 */
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Check, Flame, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { RichText } from "@/components/study/subject-sections";
import { SpeakButton } from "@/components/study/speak-button";
import { REASON_LABEL } from "@/domain/spark/spark";
import type { SparkState } from "@/server/study/spark";
import { answerSparkAction, nextSparkAction } from "@/app/(app)/spark-actions";
import { cn } from "@/lib/utils";

export function SparkCard({ initial }: { initial: SparkState }) {
  const [state, setState] = useState(initial);
  const [chosen, setChosen] = useState<number | null>(null);
  const [saving, startSaving] = useTransition();
  const [loading, startLoading] = useTransition();
  const [failed, setFailed] = useState(false);
  const spark = state.spark;
  const answered = chosen !== null;

  const choose = (i: number) => {
    if (!spark || answered) return;
    setChosen(i);
    startSaving(async () => {
      try {
        const summary = await answerSparkAction({ subjectId: spark.subjectId, correct: i === spark.correctIndex });
        setState((s) => ({ ...s, ...summary }));
      } catch {
        /* La correzione è già a schermo: senza rete si perde solo il conteggio. */
      }
    });
  };

  const another = () => {
    setFailed(false);
    startLoading(async () => {
      try {
        const next = await nextSparkAction();
        setState(next);
        setChosen(null);
      } catch {
        setFailed(true);
      }
    });
  };

  useEffect(() => {
    if (!spark || answered) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= spark.options.length) {
        e.preventDefault();
        choose(n - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // `choose` dipende solo da spark e answered, già tra le dipendenze.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spark, answered]);

  const score = state.today.total > 0 && (
    <span className="tabular-nums" title="Stimoli corretti oggi">
      oggi {state.today.correct}/{state.today.total}
    </span>
  );
  const streak = state.streak > 1 && (
    <span className="inline-flex items-center gap-1 text-gold" title="Giorni consecutivi con almeno uno stimolo">
      <Flame className="size-3.5" aria-hidden />
      {state.streak} giorni
    </span>
  );

  return (
    <section aria-labelledby="spark-title" className="rounded-lg border border-primary/30 bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <h2 id="spark-title" className="flex items-center gap-2 text-[15px] font-medium">
          <Sparkles className="size-4 text-gold" aria-hidden />
          Stimolo {state.slotLabel}
        </h2>
        {spark && <Badge variant={spark.reason === "retry" || spark.reason === "weak" ? "gold" : "primary"}>{REASON_LABEL[spark.reason]}</Badge>}
        <span className="ml-auto flex items-center gap-3 text-xs text-muted">
          {streak}
          {score}
        </span>
      </div>

      {!spark ? (
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted">
            {state.answeredInSlot > 0 ? (
              <>
                <Check className="mr-1.5 inline size-4 text-success" aria-hidden />
                Fatto. Il prossimo ti aspetta {state.nextLabel}.
              </>
            ) : (
              "Nessuna domanda pronta in questo momento."
            )}
          </p>
          {state.answeredInSlot > 0 && (
            <Button variant="secondary" onClick={another} disabled={loading} className="sm:shrink-0">
              {loading ? "Un attimo…" : "Un'altra domanda"}
            </Button>
          )}
        </div>
      ) : (
        <div className="mt-4">
          <p className="text-sm text-muted">{spark.prompt}</p>
          {spark.display && (
            <p
              lang="ja"
              className={cn(
                "mt-2 break-words",
                spark.kind === "sentence" ? "jp text-xl leading-relaxed sm:text-2xl" : "kanji-display text-5xl sm:text-6xl",
              )}
            >
              {spark.display}
            </p>
          )}
          {spark.hint && <p className="mt-2 text-sm text-muted">{spark.hint}</p>}

          <ol className="mt-4 grid grid-cols-2 gap-2" aria-label="Risposte possibili">
            {spark.options.map((o, i) => {
              const isCorrect = i === spark.correctIndex;
              const isChosen = i === chosen;
              return (
                <li key={`${spark.key}-${i}`}>
                  <button
                    type="button"
                    onClick={() => choose(i)}
                    disabled={answered}
                    aria-label={answered ? `${o.label}: ${isCorrect ? "risposta corretta" : isChosen ? "risposta sbagliata" : "non scelta"}` : undefined}
                    className={cn(
                      "flex min-h-14 w-full items-center gap-2 rounded-md border px-3 py-2 text-left transition-colors",
                      o.jp ? "jp text-xl" : "text-sm",
                      !answered && "border-border bg-elevated hover:border-primary/60 hover:bg-elevated/70",
                      answered && isCorrect && "border-success/60 bg-success/15 text-foreground",
                      answered && !isCorrect && isChosen && "border-error/60 bg-error/15 text-foreground",
                      answered && !isCorrect && !isChosen && "border-border/60 bg-transparent text-muted",
                    )}
                  >
                    <span className="hidden font-mono text-[11px] text-muted sm:inline" aria-hidden>
                      {i + 1}
                    </span>
                    <span lang={o.jp ? "ja" : undefined} className="min-w-0 flex-1 break-words">
                      {o.label}
                    </span>
                    {answered && isCorrect && <Check className="size-4 shrink-0 text-success" aria-hidden />}
                    {answered && !isCorrect && isChosen && <X className="size-4 shrink-0 text-error" aria-hidden />}
                  </button>
                </li>
              );
            })}
          </ol>

          {answered && (
            <div className="mt-4 space-y-3" aria-live="polite">
              <p className={cn("text-sm font-medium", chosen === spark.correctIndex ? "text-success" : "text-error")}>
                {chosen === spark.correctIndex ? "Esatto!" : "Non proprio: guarda la risposta giusta."}
              </p>
              <div className="flex items-center gap-3 rounded-md bg-elevated/60 p-3">
                <span lang="ja" className="kanji-display shrink-0 text-3xl">
                  {spark.reveal.characters}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium capitalize">{spark.reveal.meaning}</span>
                  {spark.reveal.reading && (
                    <span lang="ja" className="jp block text-sm text-muted">
                      {spark.reveal.reading}
                    </span>
                  )}
                </span>
                {spark.reveal.speech && <SpeakButton text={spark.reveal.speech} size="sm" />}
              </div>
              {spark.reveal.facts.map((f) => (
                <div key={f.title} className="text-sm leading-relaxed">
                  <p className="text-xs text-muted">{f.title}</p>
                  <p className={cn("mt-0.5", f.jp && "jp")}>
                    <RichText text={f.text} />
                  </p>
                </div>
              ))}
              <div className="flex flex-col gap-2 pt-1 sm:flex-row">
                <Button onClick={another} disabled={saving || loading} className="sm:flex-1">
                  {loading ? "Un attimo…" : "Un'altra domanda"}
                </Button>
                <Button asChild variant="secondary" className="sm:flex-1">
                  <Link href={`/subjects/${spark.subjectId}`}>Apri la scheda</Link>
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
      {failed && (
        <p role="alert" className="mt-3 text-xs text-error">
          Non sono riuscito a caricare un&apos;altra domanda. Riprova tra poco.
        </p>
      )}
    </section>
  );
}
