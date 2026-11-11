"use client";

/**
 * Lettore di un brano: furigana adattivo ai progressi sui kanji, scheda della parola al tocco,
 * domande in stile JLPT corrette dal server.
 * Modalità esame: tempo indicativo, niente furigana né schede finché non si consegna.
 */
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Check, Clock, ExternalLink, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/misc";
import { SpeakButton } from "@/components/study/speak-button";
import { prioritizeLessonsAction, submitReadingAction } from "@/app/(app)/reading/actions";
import { FORMAT_SECONDS } from "@/domain/reading/content";
import { kanaText, kanjiOf, type RubySegment } from "@/domain/reading/markup";
import { showFurigana, type FuriganaMode, type KanjiState } from "@/domain/reading/readability";
import { stageLabel, type SrsStage } from "@/domain/srs/stages";
import type { PassageDetail, ReaderSubject, ReadingResult } from "@/server/reading/passages";
import { cn } from "@/lib/utils";
import { RubyText } from "./ruby-text";

const MODE_LABEL: Record<FuriganaMode, string> = { adaptive: "Adattivo", always: "Sempre", never: "Mai" };
const STATE_LABEL: Record<KanjiState, string> = { known: "Conosciuto", learning: "In apprendimento", new: "Non ancora studiato" };

function stateBadge(s: ReaderSubject) {
  const variant = s.state === "known" ? "success" : s.state === "learning" ? "primary" : "outline";
  const label = s.stage && s.stage > 0 ? stageLabel(s.stage as SrsStage) : STATE_LABEL[s.state];
  return <Badge variant={variant}>{label}</Badge>;
}

function clock(totalSeconds: number) {
  const s = Math.abs(totalSeconds);
  return `${totalSeconds < 0 ? "+" : ""}${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

interface Selection {
  paragraph: number;
  index: number;
  segment: RubySegment;
}

export function PassageReader({
  passage,
  exam,
  defaultFurigana,
  nextSlug,
}: {
  passage: Omit<PassageDetail, "attempts">;
  exam: boolean;
  defaultFurigana: FuriganaMode;
  nextSlug: string | null;
}) {
  const [mode, setMode] = useState<FuriganaMode>(defaultFurigana);
  const [selected, setSelected] = useState<Selection | null>(null);
  const [answers, setAnswers] = useState<(number | null)[]>(() => passage.questions.map(() => null));
  const [result, setResult] = useState<ReadingResult | null>(null);
  const [lookups, setLookups] = useState<string[]>([]);
  const [knownLookups, setKnownLookups] = useState<string[]>([]);
  const [prioritized, setPrioritized] = useState<string[]>(passage.prioritized);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);

  // In esame gli aiuti restano spenti finché non si consegna.
  const locked = exam && !result;
  const subjects = passage.subjects;

  useEffect(() => {
    startedAt.current = Date.now();
    if (!exam) return;
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [exam]);

  const furigana = useMemo(() => {
    if (locked) return false;
    return (seg: RubySegment) =>
      showFurigana(
        mode,
        (seg.k ?? []).map((id) => subjects[id]?.state ?? "new"),
        kanjiOf(seg.b).length,
      );
  }, [locked, mode, subjects]);

  const fullKana = useMemo(() => passage.paragraphs.map((p) => kanaText(p)).join("\n"), [passage.paragraphs]);

  function openWord(paragraph: number, segment: RubySegment, index: number) {
    setSelected({ paragraph, index, segment });
    const ids = [...(segment.k ?? []), ...(segment.v ? [segment.v] : [])];
    if (result || ids.length === 0) return;
    setLookups((prev) => [...new Set([...prev, ...ids])]);
    // Conta come "kanji noto consultato" solo una parola che il furigana adattivo lascerebbe senza aiuto.
    const states = (segment.k ?? []).map((id) => subjects[id]?.state ?? "new");
    if (!showFurigana("adaptive", states, kanjiOf(segment.b).length)) setKnownLookups((prev) => [...new Set([...prev, ...(segment.k ?? [])])]);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        const r = await submitReadingAction({
          passageId: passage.id,
          mode: exam ? "exam" : "study",
          answers,
          lookups,
          durationMs: Date.now() - startedAt.current,
        });
        setResult(r);
        setSelected(null);
        window.scrollTo({ top: document.getElementById("domande")?.offsetTop ?? 0, behavior: "smooth" });
      } catch {
        setError("Non sono riuscito a registrare le risposte. Controlla la connessione e riprova.");
      }
    });
  }

  function restart() {
    setAnswers(passage.questions.map(() => null));
    setResult(null);
    setLookups([]);
    setKnownLookups([]);
    setSelected(null);
    setElapsed(0);
    startedAt.current = Date.now();
    window.scrollTo({ top: 0 });
  }

  function prioritize() {
    const ids = passage.missingKanji.map((k) => k.id);
    startTransition(async () => {
      try {
        await prioritizeLessonsAction(ids);
        setPrioritized(ids);
      } catch {
        setError("Non sono riuscito ad aggiornare la coda delle lezioni. Riprova.");
      }
    });
  }

  const allAnswered = answers.every((a) => a !== null);
  const remaining = FORMAT_SECONDS[passage.format] - elapsed;
  const missingPending = passage.missingKanji.filter((k) => !prioritized.includes(k.id));
  const lookedUpKnown = knownLookups.map((id) => subjects[id]).filter((s): s is ReaderSubject => !!s);

  return (
    <div className={cn("space-y-5", selected && "pb-56 md:pb-48")}>
      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-xl font-medium leading-relaxed sm:text-2xl">
              <RubyText segments={passage.title} furigana={furigana} />
            </h1>
            {locked ? (
              <span
                className={cn("inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-sm tabular-nums", remaining < 0 && "border-error/40 text-error")}
                role="timer"
                aria-label="Tempo rimasto"
              >
                <Clock className="size-4" aria-hidden /> {clock(remaining)}
              </span>
            ) : (
              <SpeakButton text={fullKana} label="Ascolta tutto il brano" />
            )}
          </div>
          {!locked && <CardDescription>{passage.titleIt}</CardDescription>}
          {!locked && (
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
              <span className="text-xs text-muted">
                {mode === "adaptive" ? "Furigana solo sui kanji che non conosci ancora. " : ""}Tocca una parola per la scheda.
              </span>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-5 pb-6 pt-3 text-[19px] leading-[2.5] sm:text-xl sm:leading-[2.6]">
          {passage.paragraphs.map((p, pi) => (
            <p key={pi} className="whitespace-pre-line">
              <RubyText
                segments={p}
                furigana={furigana}
                onWord={locked ? undefined : (seg, i) => openWord(pi, seg, i)}
                activeIndex={selected?.paragraph === pi ? selected.index : null}
              />
            </p>
          ))}
        </CardContent>
      </Card>

      {!locked && passage.missingKanji.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              {passage.missingKanji.length === 1 ? "Ti manca 1 kanji" : `Ti mancano ${passage.missingKanji.length} kanji`} per leggere questo brano senza aiuti
            </CardTitle>
            <CardDescription>Non li hai ancora studiati. Puoi metterli in cima alla coda delle lezioni.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="flex flex-wrap gap-2">
              {passage.missingKanji.map((k) => (
                <li key={k.id}>
                  <Link
                    href={`/subjects/${k.id}`}
                    target="_blank"
                    title={k.meaning}
                    className="kanji-display inline-flex min-w-10 items-center justify-center rounded-md bg-primary/15 px-2 py-1.5 text-lg text-secondary"
                  >
                    {k.characters}
                  </Link>
                </li>
              ))}
            </ul>
            {missingPending.length > 0 ? (
              <Button variant="secondary" size="sm" onClick={prioritize} disabled={pending}>
                Studiali per primi
              </Button>
            ) : (
              <p className="text-sm text-success">
                In cima alla coda.{" "}
                <Link href="/lessons" className="text-secondary hover:underline">
                  Vai alle lezioni →
                </Link>
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <section id="domande" className="scroll-mt-20 space-y-4" aria-label="Domande">
        {result && (
          <Card className={result.correctCount === result.totalCount ? "border-success/40" : "border-gold/40"}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-4 sm:pt-5">
              <p className="text-lg font-medium" role="status">
                {result.correctCount} su {result.totalCount} {result.totalCount === 1 ? "risposta corretta" : "risposte corrette"}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={restart}>
                  <RotateCcw aria-hidden /> Rileggi
                </Button>
                {nextSlug && (
                  <Button asChild size="sm">
                    <Link href={`/reading/${nextSlug}`}>Prossimo brano →</Link>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {passage.questions.map((q, qi) => {
          const graded = result?.questions[qi];
          return (
            <Card key={q.id}>
              <CardContent className="pt-4 sm:pt-5">
                <fieldset disabled={!!result}>
                  <legend className="text-[17px] leading-loose">
                    <span className="mr-2 text-sm text-muted">問{qi + 1}</span>
                    <RubyText segments={q.prompt} furigana={furigana} />
                  </legend>
                  <div className="mt-3 grid gap-2">
                    {q.choices.map((c, ci) => {
                      const chosen = answers[qi] === ci;
                      const isAnswer = graded?.answerIndex === ci;
                      return (
                        <label
                          key={ci}
                          className={cn(
                            "flex cursor-pointer items-start gap-3 rounded-md border border-border px-3 py-2.5 text-[16px] leading-loose transition-colors hover:bg-elevated",
                            !graded && chosen && "border-primary bg-primary/10",
                            graded && "cursor-default hover:bg-transparent",
                            graded && isAnswer && "border-success/60 bg-success/10",
                            graded && chosen && !isAnswer && "border-error/60 bg-error/10",
                          )}
                        >
                          <input
                            type="radio"
                            name={`q-${q.id}`}
                            className="sr-only"
                            checked={chosen}
                            onChange={() => setAnswers((prev) => prev.map((a, i) => (i === qi ? ci : a)))}
                          />
                          <span
                            className={cn(
                              "mt-1.5 grid size-6 shrink-0 place-items-center rounded-full border border-border text-xs text-muted",
                              !graded && chosen && "border-primary bg-primary text-on-primary",
                            )}
                            aria-hidden
                          >
                            {graded && isAnswer ? <Check className="size-3.5 text-success" /> : graded && chosen ? <X className="size-3.5 text-error" /> : ci + 1}
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
                  <p className="mt-3 rounded-md bg-elevated/60 p-3 text-sm leading-relaxed">
                    <span className={cn("font-medium", graded.correct ? "text-success" : "text-error")}>{graded.correct ? "Corretto. " : "Non corretto. "}</span>
                    {graded.explanation}
                  </p>
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
            {!allAnswered && <span className="text-xs text-muted">Rispondi a tutte le domande per continuare.</span>}
          </div>
        )}
        {error && (
          <p className="text-sm text-error" role="alert">
            {error}
          </p>
        )}
      </section>

      {result && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Traduzione</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-relaxed text-muted">
              {result.translation.map((t, i) => (
                <p key={i} className="whitespace-pre-line">
                  {t}
                </p>
              ))}
            </CardContent>
          </Card>

          {lookedUpKnown.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Kanji che conosci e hai consultato</CardTitle>
                <CardDescription>
                  Risultano a Guru o oltre, ma leggendo ti è servita la scheda. Lo SRS non cambia: se vuoi, riportali in ripasso dalla loro scheda.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-wrap gap-2">
                  {lookedUpKnown.map((k) => (
                    <li key={k.id}>
                      <Link
                        href={`/subjects/${k.id}`}
                        target="_blank"
                        title={k.meaning}
                        className="kanji-display inline-flex min-w-10 items-center justify-center rounded-md bg-gold/15 px-2 py-1.5 text-lg text-gold"
                      >
                        {k.characters}
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {selected && !locked && <WordPanel segment={selected.segment} subjects={subjects} onClose={() => setSelected(null)} />}
    </div>
  );
}

function WordPanel({ segment, subjects, onClose }: { segment: RubySegment; subjects: Record<string, ReaderSubject>; onClose: () => void }) {
  const vocab = segment.v ? subjects[segment.v] : undefined;
  const kanji = (segment.k ?? []).map((id) => subjects[id]).filter((s): s is ReaderSubject => !!s);
  const tracked = new Set(kanji.map((k) => k.characters));
  const outside = kanjiOf(segment.b).filter((c) => !tracked.has(c));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <aside
      aria-label={`Scheda di ${segment.b}`}
      className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-40 max-h-[55dvh] overflow-y-auto border-t border-border bg-surface px-4 py-4 shadow-2xl md:bottom-0 md:left-60 md:px-8"
    >
      <div className="mx-auto max-w-3xl space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <p className="jp text-2xl font-medium" lang="ja">
              {segment.b}
            </p>
            <p className="jp text-base text-secondary" lang="ja">
              {segment.r}
            </p>
            <SpeakButton text={vocab?.reading && vocab.characters !== segment.b ? vocab.reading : segment.r} size="sm" />
          </div>
          <button type="button" onClick={onClose} aria-label="Chiudi la scheda" className="grid size-8 place-items-center rounded-full text-muted hover:bg-elevated hover:text-foreground">
            <X className="size-4" aria-hidden />
          </button>
        </div>

        {vocab && (
          <SubjectRow subject={vocab} label={vocab.characters !== segment.b ? `${vocab.characters}（${vocab.reading ?? ""}）` : "Vocabolo"} />
        )}
        {kanji.map((k) => (
          <SubjectRow key={k.id} subject={k} label={k.characters} big />
        ))}
        {outside.length > 0 && (
          <p className="text-xs text-muted">
            <span className="jp text-sm text-foreground">{outside.join("・")}</span> non {outside.length === 1 ? "è" : "sono"} nel percorso N5–N3: qui il furigana resta sempre visibile.
          </p>
        )}
        {!vocab && kanji.length === 0 && outside.length === 0 && <p className="text-sm text-muted">Nessuna scheda collegata.</p>}
      </div>
    </aside>
  );
}

function SubjectRow({ subject, label, big }: { subject: ReaderSubject; label: string; big?: boolean }) {
  return (
    <Link
      href={`/subjects/${subject.id}`}
      target="_blank"
      className="flex items-center gap-3 rounded-md bg-elevated/50 px-3 py-2 transition-colors hover:bg-elevated"
    >
      <span className={cn("jp shrink-0", big ? "kanji-display grid size-9 place-items-center rounded-sm bg-primary/15 text-xl text-secondary" : "text-sm text-vocab")} lang="ja">
        {label}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm capitalize">{subject.meaning}</span>
        {big && subject.jlpt && <span className="block text-[11px] text-muted">Kanji {subject.jlpt}</span>}
      </span>
      {stateBadge(subject)}
      <ExternalLink className="size-3.5 shrink-0 text-muted" aria-hidden />
    </Link>
  );
}
