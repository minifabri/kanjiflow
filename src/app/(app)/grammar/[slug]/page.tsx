import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/misc";
import { GrammarSheet } from "@/components/grammar/grammar-sheet";
import { markGrammarKnownAction, resetGrammarPointAction } from "@/app/(app)/grammar/actions";
import { plainText } from "@/domain/reading/markup";
import { furiganaRule } from "@/domain/reading/readability";
import { stageLabel, type SrsStage } from "@/domain/srs";
import { getGrammarPoint } from "@/server/grammar/points";
import { getStudyContext } from "@/server/study/context";

export async function generateMetadata({ params }: PageProps<"/grammar/[slug]">) {
  const { slug } = await params;
  const point = await getGrammarPoint(await getStudyContext(), slug);
  return { title: point ? plainText(point.sheet.title) : "Grammatica" };
}

const MODE_LABEL: Record<string, string> = { lesson: "lezione", review: "ripasso", practice: "pratica" };

export default async function GrammarPointPage({ params }: PageProps<"/grammar/[slug]">) {
  const { slug } = await params;
  const ctx = await getStudyContext();
  const point = await getGrammarPoint(ctx, slug);
  if (!point) notFound();
  const { sheet, progress } = point;
  const furigana = furiganaRule(ctx.settings.showFurigana ? "adaptive" : "never", point.kanjiStates);
  const fmt = new Intl.DateTimeFormat("it-IT", { timeZone: ctx.timeZone, dateStyle: "medium", timeStyle: "short" });

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href="/grammar" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Grammatica
      </Link>

      <Card>
        <CardContent className="space-y-6 py-8">
          <div className="flex flex-wrap justify-center gap-2">
            <Badge variant="primary">{sheet.level}</Badge>
            <Badge variant={progress ? "primary" : "outline"}>{progress ? stageLabel(progress.stage as SrsStage) : "Non ancora studiato"}</Badge>
            {progress?.markedKnown && <Badge variant="outline">segnato come noto</Badge>}
          </div>
          <GrammarSheet sheet={sheet} furigana={furigana} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Esercizi e ripasso</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {progress ? (
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <Stat label="Stadio" value={stageLabel(progress.stage as SrsStage)} />
              <Stat label="Prossimo ripasso" value={progress.nextReviewAt ? (progress.nextReviewAt <= new Date() ? "ora" : fmt.format(progress.nextReviewAt)) : "—"} />
              <Stat label="Ripassi" value={`${progress.correct} ✓ · ${progress.incorrect} ✗`} />
            </dl>
          ) : (
            <p className="text-sm text-muted">Non è ancora nei ripassi: entrerà quando lo studierai tra i punti nuovi, oppure puoi segnarlo come già noto.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href={`/grammar/session?mode=practice&point=${sheet.slug}`}>Esercitati ({point.exerciseCount} esercizi)</Link>
            </Button>
            {!progress && (
              <form action={markGrammarKnownAction.bind(null, sheet.id, sheet.slug)}>
                <Button type="submit" variant="outline">
                  La conosco già
                </Button>
              </form>
            )}
            {progress && (
              <form action={resetGrammarPointAction.bind(null, sheet.id, sheet.slug)}>
                <Button type="submit" variant="outline">
                  Togli dai ripassi
                </Button>
              </form>
            )}
          </div>
          <p className="text-xs text-muted">La pratica libera non modifica lo stadio SRS.</p>
        </CardContent>
      </Card>

      {point.attempts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Ultime risposte</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-xs">
              {point.attempts.map((a, i) => (
                <li key={i} className="flex flex-wrap justify-between gap-2">
                  <span>
                    <span className={a.isCorrect ? "text-success" : "text-error"}>{a.isCorrect ? "✓" : "✗"}</span> {MODE_LABEL[a.mode] ?? a.mode}
                    {a.previousStage !== null && a.nextStage !== null && a.previousStage > 0 && (
                      <span className="ml-1 text-muted">
                        ({stageLabel(a.previousStage as SrsStage)} → {stageLabel(a.nextStage as SrsStage)})
                      </span>
                    )}
                  </span>
                  <span className="text-muted">{fmt.format(a.attemptedAt)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <nav className="flex justify-between gap-3 text-sm" aria-label="Altri punti">
        {point.previous ? (
          <Link href={`/grammar/${point.previous.slug}`} className="inline-flex items-center gap-1.5 text-muted hover:text-foreground">
            <ArrowLeft className="size-4" aria-hidden />
            <span className="jp" lang="ja">
              {plainText(point.previous.title)}
            </span>
          </Link>
        ) : (
          <span />
        )}
        {point.next && (
          <Link href={`/grammar/${point.next.slug}`} className="inline-flex items-center gap-1.5 text-muted hover:text-foreground">
            <span className="jp" lang="ja">
              {plainText(point.next.title)}
            </span>
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        )}
      </nav>

      <p className="text-center text-[11px] text-muted">
        Scheda ed esercizi originali di KanjiFlow, non tratti da prove d&apos;esame ·{" "}
        <Link href="/settings/data#fonti" className="underline">
          fonti e licenze
        </Link>
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-elevated/50 p-3">
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className="mt-0.5">{value}</dd>
    </div>
  );
}
