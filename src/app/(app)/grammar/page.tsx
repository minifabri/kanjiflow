import Link from "next/link";
import { BookOpen, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, Progress } from "@/components/ui/misc";
import { GRAMMAR_LEVELS } from "@/domain/grammar/content";
import { plainText } from "@/domain/reading/markup";
import { stageGroup, stageLabel, type SrsStage } from "@/domain/srs";
import { getGrammarOverview, GRAMMAR_REVIEW_BATCH, type GrammarPointSummary } from "@/server/grammar/points";
import { getStudyContext } from "@/server/study/context";
import { cn } from "@/lib/utils";

export const metadata = { title: "Grammatica" };

const pct = (a: number, b: number) => (b === 0 ? 0 : Math.round((a / b) * 100));

export default async function GrammarPage() {
  const ctx = await getStudyContext();
  const o = await getGrammarOverview(ctx);
  const lessonBatch = o.nextLessons.length;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Grammatica</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Punti grammaticali N4 e N3 con esercizi in stile JLPT. I ripassi seguono gli stessi intervalli dei kanji, ma in una coda a parte.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2" aria-label="Azioni principali">
        <Card>
          <CardContent className="flex h-full flex-col gap-3 pt-4 sm:pt-5">
            <BookOpen className="size-4 text-primary" aria-hidden />
            <div>
              <p className="text-3xl font-semibold tabular-nums">{lessonBatch}</p>
              <p className="mt-0.5 text-xs text-muted">
                {lessonBatch === 1 ? "Punto nuovo da studiare" : "Punti nuovi da studiare"} · {o.lessonsToday}/{o.dailyLimit} oggi
              </p>
            </div>
            {lessonBatch > 0 ? (
              <Button asChild className="mt-auto self-start">
                <Link href="/grammar/session?mode=lesson">Studia i punti nuovi</Link>
              </Button>
            ) : (
              <p className="mt-auto text-xs text-muted">
                {o.newAvailable === 0 ? "Hai iniziato tutti i punti disponibili." : "Limite di oggi raggiunto: puoi alzarlo nelle impostazioni."}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex h-full flex-col gap-3 pt-4 sm:pt-5">
            <RefreshCw className="size-4 text-gold" aria-hidden />
            <div>
              <p className="text-3xl font-semibold tabular-nums">{o.dueCount}</p>
              <p className="mt-0.5 text-xs text-muted">{o.dueCount === 1 ? "Ripasso disponibile" : "Ripassi disponibili"}</p>
            </div>
            {o.dueCount > 0 ? (
              <Button asChild variant="gold" className="mt-auto self-start">
                <Link href="/grammar/session?mode=review">
                  Inizia i ripassi{o.dueCount > GRAMMAR_REVIEW_BATCH ? ` (${GRAMMAR_REVIEW_BATCH} per volta)` : ""}
                </Link>
              </Button>
            ) : (
              <p className="mt-auto text-xs text-muted">Nessun punto in scadenza.</p>
            )}
          </CardContent>
        </Card>
      </section>

      {GRAMMAR_LEVELS.map((level) => {
        const points = o.points.filter((p) => p.level === level);
        const stats = o.byLevel[level] ?? { total: 0, started: 0, passed: 0 };
        if (points.length === 0) return null;
        return (
          <Card key={level}>
            <CardHeader>
              <div className="flex items-baseline justify-between gap-3">
                <CardTitle>
                  {level} · {level === ctx.settings.targetJlpt ? "obiettivo attuale" : "riscaldamento"}
                </CardTitle>
                <span className="text-xs tabular-nums text-muted">
                  {stats.passed}/{stats.total} a Guru o oltre · {stats.started} iniziati
                </span>
              </div>
              <Progress value={pct(stats.passed, stats.total)} className="mt-2 h-1.5" aria-label={`Punti ${level} a Guru o oltre`} />
            </CardHeader>
            <CardContent>
              <ul className="grid gap-2 sm:grid-cols-2">
                {points.map((p) => (
                  <li key={p.id}>
                    <PointRow point={p} />
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

const GROUP_STYLE: Record<string, string> = {
  apprentice: "bg-primary/15 text-secondary",
  guru: "bg-primary/25 text-foreground",
  master: "bg-elevated text-foreground",
  enlightened: "bg-elevated text-foreground",
  burned: "bg-gold/15 text-gold",
};

function PointRow({ point: p }: { point: GrammarPointSummary }) {
  return (
    <Link href={`/grammar/${p.slug}`} className="flex items-center justify-between gap-3 rounded-md bg-elevated/40 px-3 py-2.5 transition-colors hover:bg-elevated">
      <span className="min-w-0">
        <span className="jp block truncate text-[15px] font-medium" lang="ja">
          {plainText(p.title)}
        </span>
        <span className="block truncate text-xs text-muted">{p.meaning}</span>
      </span>
      {p.stage === null ? (
        <Badge variant="outline" className="shrink-0">
          nuovo
        </Badge>
      ) : (
        <span className="flex shrink-0 items-center gap-1.5">
          {p.due && <Badge variant="gold">da ripassare</Badge>}
          <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", GROUP_STYLE[stageGroup(p.stage as SrsStage)])}>{stageLabel(p.stage as SrsStage)}</span>
        </span>
      )}
    </Link>
  );
}
