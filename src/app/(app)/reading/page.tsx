import Link from "next/link";
import { BookText, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, Progress } from "@/components/ui/misc";
import { FORMAT_LABEL, READING_FORMATS, READING_LEVELS } from "@/domain/reading/content";
import { plainText } from "@/domain/reading/markup";
import { getStudyContext } from "@/server/study/context";
import { listPassages, readingOverview, recommendPassages, type PassageSummary } from "@/server/reading/passages";
import { cn } from "@/lib/utils";

export const metadata = { title: "Lettura" };

const pct = (a: number, b: number) => (b === 0 ? 0 : Math.round((a / b) * 100));

export default async function ReadingPage({ searchParams }: PageProps<"/reading">) {
  const sp = await searchParams;
  const level = READING_LEVELS.find((l) => l === sp.level) ?? null;
  const format = READING_FORMATS.find((f) => f === sp.format) ?? null;
  const ctx = await getStudyContext();
  const all = await listPassages(ctx);
  const overview = readingOverview(all);
  const shown = recommendPassages(all).filter((p) => (!level || p.level === level) && (!format || p.format === format));
  const href = (next: { level?: string | null; format?: string | null }) => {
    const q = new URLSearchParams();
    const l = next.level === undefined ? level : next.level;
    const f = next.format === undefined ? format : next.format;
    if (l) q.set("level", l);
    if (f) q.set("format", f);
    const s = q.toString();
    return s ? `/reading?${s}` : "/reading";
  };

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Lettura</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Brani in stile JLPT che seguono i tuoi kanji: il furigana compare solo su quelli che non conosci ancora, e ogni parola apre la sua scheda.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-3" aria-label="Riepilogo">
        {READING_LEVELS.map((l) => {
          const b = overview.byLevel[l] ?? { total: 0, read: 0 };
          return (
            <Card key={l}>
              <CardContent className="pt-4 sm:pt-5">
                <div className="flex items-baseline justify-between">
                  <p className="text-sm font-medium">Brani {l}</p>
                  <p className="text-sm tabular-nums text-muted">
                    {b.read}/{b.total}
                  </p>
                </div>
                <Progress value={pct(b.read, b.total)} className="mt-3" aria-label={`Brani ${l} letti`} />
                <p className="mt-2 text-xs text-muted">{l === ctx.settings.targetJlpt ? "Obiettivo attuale" : "Riscaldamento"}</p>
              </CardContent>
            </Card>
          );
        })}
        <Card>
          <CardContent className="pt-4 sm:pt-5">
            <p className="text-sm font-medium">Risposte corrette</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{overview.accuracy.total ? `${pct(overview.accuracy.correct, overview.accuracy.total)}%` : "—"}</p>
            <p className="mt-1 text-xs text-muted">
              {overview.accuracy.total ? `${overview.accuracy.correct} su ${overview.accuracy.total}, miglior tentativo per brano` : "Leggi il primo brano per cominciare"}
            </p>
          </CardContent>
        </Card>
      </section>

      {overview.suggested && (
        <Card className="border-primary/40">
          <CardContent className="flex flex-col gap-4 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-md bg-primary/15 text-primary">
                <BookText className="size-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-xs text-muted">Consigliato per te · conosci il {overview.suggested.readability.percent}% dei kanji</p>
                <p className="jp mt-0.5 truncate text-lg font-medium" lang="ja">
                  {plainText(overview.suggested.title)}
                </p>
                <p className="truncate text-xs text-muted">
                  {overview.suggested.titleIt} · {overview.suggested.level} · {FORMAT_LABEL[overview.suggested.format].toLowerCase()}
                </p>
              </div>
            </div>
            <Button asChild size="lg">
              <Link href={`/reading/${overview.suggested.slug}`}>Leggi ora</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <nav aria-label="Filtri" className="flex flex-wrap gap-x-6 gap-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Pill href={href({ level: null })} active={!level}>
            Tutti i livelli
          </Pill>
          {READING_LEVELS.map((l) => (
            <Pill key={l} href={href({ level: l })} active={level === l}>
              {l}
            </Pill>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Pill href={href({ format: null })} active={!format}>
            Tutti i formati
          </Pill>
          {READING_FORMATS.map((f) => (
            <Pill key={f} href={href({ format: f })} active={format === f}>
              {FORMAT_LABEL[f]}
            </Pill>
          ))}
        </div>
      </nav>

      <Card>
        <CardHeader>
          <CardTitle>{shown.length} brani, dal più leggibile per te</CardTitle>
        </CardHeader>
        <CardContent>
          {shown.length === 0 ? (
            <p className="text-sm text-muted">Nessun brano con questi filtri.</p>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {shown.map((p) => (
                <li key={p.id}>
                  <PassageCard passage={p} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Pill({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn("rounded-full border border-border px-3 py-1 text-xs text-muted transition-colors hover:text-foreground", active && "border-primary/50 bg-primary/15 text-foreground")}
    >
      {children}
    </Link>
  );
}

function PassageCard({ passage: p }: { passage: PassageSummary }) {
  const r = p.readability;
  return (
    <Link href={`/reading/${p.slug}`} className="flex h-full flex-col gap-3 rounded-md border border-border/60 bg-elevated/40 p-4 transition-colors hover:border-primary/50">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="jp truncate text-[17px] font-medium" lang="ja">
            {plainText(p.title)}
          </p>
          <p className="truncate text-xs text-muted">{p.titleIt}</p>
        </div>
        {p.best && (
          <Badge variant={p.best.correct === p.best.total ? "success" : "gold"} className="shrink-0">
            <Check className="size-3" aria-hidden /> {p.best.correct}/{p.best.total}
          </Badge>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Badge variant="outline">{p.level}</Badge>
        <Badge variant="outline">{FORMAT_LABEL[p.format]}</Badge>
        <Badge variant="outline">{p.charCount} caratteri</Badge>
        {p.weakKanji > 0 && <Badge variant="gold">{p.weakKanji === 1 ? "1 kanji che sbagli spesso" : `${p.weakKanji} kanji che sbagli spesso`}</Badge>}
      </div>
      <div className="mt-auto">
        <div className="flex items-baseline justify-between text-xs">
          <span className="text-muted">Kanji che conosci</span>
          <span className="tabular-nums">{r.percent}%</span>
        </div>
        <Progress value={r.percent} className="mt-1.5 h-1.5" indicatorClassName={r.percent >= 90 ? "bg-success" : undefined} aria-label="Kanji che conosci in questo brano" />
        <p className="mt-1.5 text-[11px] text-muted">
          {r.known} di {r.total}
          {r.learning > 0 && ` · ${r.learning} in apprendimento`}
          {r.missing > 0 && ` · ${r.missing} da studiare`}
        </p>
      </div>
    </Link>
  );
}
