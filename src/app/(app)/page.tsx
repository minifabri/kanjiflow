import Link from "next/link";
import { BookOpen, Flame, RefreshCw, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/misc";
import { ForecastChart } from "@/components/dashboard/forecast-chart";
import { Heatmap } from "@/components/dashboard/heatmap";
import { SparkCard } from "@/components/dashboard/spark-card";
import { getStudyContext } from "@/server/study/context";
import { getDashboard } from "@/server/stats/dashboard";
import { getSparkState } from "@/server/study/spark";
import { localDateKey } from "@/domain/time";

export const metadata = { title: "Dashboard" };

function greeting(date: Date, tz: string) {
  const h = Number(new Intl.DateTimeFormat("it-IT", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(date));
  if (h < 5) return "こんばんは。";
  if (h < 11) return "おはようございます。";
  if (h < 18) return "おかえりなさい。";
  return "こんばんは。";
}

const pct = (a: number, b: number) => (b === 0 ? 0 : Math.round((a / b) * 100));

export default async function DashboardPage() {
  const ctx = await getStudyContext();
  const now = new Date();
  const [d, spark] = await Promise.all([getDashboard(ctx, now), getSparkState(ctx, now)]);
  const bandPct = pct(d.band.kanjiPassed, d.band.kanjiTotal);
  const acc = pct(d.accuracyToday.correct, d.accuracyToday.total);

  return (
    <div className="space-y-5">
      <section aria-labelledby="greeting">
        <h1 id="greeting" className="jp text-2xl font-medium tracking-wide sm:text-[28px]">
          {greeting(now, ctx.timeZone)}
        </h1>
        <p className="mt-1.5 text-sm text-muted">Continua il tuo percorso verso {ctx.settings.targetJlpt}.</p>
      </section>

      <SparkCard initial={spark} />

      <section className="grid grid-cols-2 gap-3" aria-label="Azioni principali">
        <Link href="/lessons" className="group rounded-lg border border-border/60 bg-surface p-4 transition-colors hover:border-primary/50 sm:p-5">
          <BookOpen className="size-4 text-primary" aria-hidden />
          <p className="mt-3 text-3xl font-semibold tabular-nums">{d.lessons.allowance}</p>
          <p className="mt-0.5 text-xs text-muted">Nuove lezioni</p>
          <span className="mt-3 inline-flex text-xs text-secondary group-hover:underline">
            {d.lessons.allowance > 0 ? "Inizia le lezioni →" : d.lessons.available > 0 ? "Limite giornaliero raggiunto" : "Nessuna lezione disponibile"}
          </span>
        </Link>
        <Link href="/reviews" className="group rounded-lg border border-border/60 bg-surface p-4 transition-colors hover:border-gold/50 sm:p-5">
          <RefreshCw className="size-4 text-gold" aria-hidden />
          <p className="mt-3 text-3xl font-semibold tabular-nums">{d.reviews.now}</p>
          <p className="mt-0.5 text-xs text-muted">Ripassi disponibili</p>
          <span className="mt-3 inline-flex text-xs text-secondary group-hover:underline">
            {d.reviews.now > 0 ? "Inizia i ripassi →" : `${d.reviews.next24h} nelle prossime 24 ore`}
          </span>
        </Link>
      </section>

      <Card>
        <CardContent className="pt-4 sm:pt-5">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[15px] font-medium">Progressione {d.band.name}</h2>
            <span className="text-lg font-medium tabular-nums text-secondary">{bandPct}%</span>
          </div>
          <Progress value={bandPct} className="mt-3" aria-label={`Kanji ${d.band.name} superati`} />
          <p className="mt-2.5 text-xs text-muted">
            {d.band.kanjiPassed} di {d.band.kanjiTotal} kanji {d.band.name} a Guru o oltre · vocaboli {d.band.name} {d.band.vocabPassed}/{d.band.vocabTotal}
            <span className="ml-1 opacity-80">(liste non ufficiali)</span>
          </p>
        </CardContent>
      </Card>

      {d.nextKanji && (
        <Card>
          <CardContent className="pt-4 sm:pt-5">
            <p className="text-xs text-muted">Prossimo kanji</p>
            <Link href={`/subjects/${d.nextKanji.id}`} className="mt-3 flex items-center gap-4 rounded-md">
              <span className="kanji-display grid size-14 shrink-0 place-items-center rounded-md bg-elevated text-[28px]">{d.nextKanji.characters}</span>
              <span className="min-w-0">
                <span className="block truncate font-medium capitalize">{d.nextKanji.meaning}</span>
                <span className="jp mt-0.5 block truncate text-sm text-muted">{d.nextKanji.readings} · Kanji</span>
              </span>
            </Link>
          </CardContent>
        </Card>
      )}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Indicatori">
        <Mini icon={<Target className="size-4 text-primary" aria-hidden />} label="Livello di studio" value={`${d.level.current}`} hint={`${d.level.passedInLevel}/${d.level.levelSize} kanji superati`} />
        <Mini icon={<Flame className="size-4 text-gold" aria-hidden />} label="Serie di studio" value={`${d.streak} ${d.streak === 1 ? "giorno" : "giorni"}`} />
        <Mini label="Accuratezza oggi" value={d.accuracyToday.total ? `${acc}%` : "—"} hint={`${d.accuracyToday.total} risposte`} />
        <Mini label="Kanji appresi" value={`${d.learnedKanji}`} hint="Guru o oltre, inclusi i già noti" />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Stadi SRS</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid grid-cols-5 gap-2 text-center">
            {(
              [
                ["Apprendista", d.stages.apprentice, "text-secondary"],
                ["Guru", d.stages.guru, "text-primary"],
                ["Maestro", d.stages.master, "text-foreground"],
                ["Illuminato", d.stages.enlightened, "text-foreground"],
                ["Bruciato", d.stages.burned, "text-gold"],
              ] as const
            ).map(([label, n, color]) => (
              <li key={label} className="rounded-md bg-elevated/60 px-1 py-3">
                <p className={`text-xl font-semibold tabular-nums ${color}`}>{n}</p>
                <p className="mt-0.5 truncate text-[11px] text-muted">{label}</p>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">
            Ripassi: {d.reviews.next24h} nelle prossime 24 ore · {d.reviews.next7d} nei prossimi 7 giorni
            {d.suspended > 0 && ` · ${d.suspended} sospesi`}
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Previsione ripassi</CardTitle>
          </CardHeader>
          <CardContent>
            <ForecastChart hourly={d.forecastHourly} daily={d.forecastDaily} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Attività</CardTitle>
          </CardHeader>
          <CardContent>
            <Heatmap data={d.heatmap} todayKey={localDateKey(now, ctx.timeZone)} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Kanji deboli</CardTitle>
        </CardHeader>
        <CardContent>
          {d.weak.length === 0 ? (
            <p className="text-sm text-muted">Ancora nessun kanji con errori ricorrenti: compariranno qui dopo qualche ripasso.</p>
          ) : (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {d.weak.map((w) => (
                <li key={w.id}>
                  <Link href={`/subjects/${w.id}`} className="flex items-center gap-3 rounded-md bg-elevated/60 p-2.5 hover:bg-elevated">
                    <span className="kanji-display text-2xl">{w.characters}</span>
                    <span className="min-w-0 text-xs">
                      <span className="block truncate text-foreground">{w.meaning}</span>
                      <span className="text-error">{pct(w.incorrect, w.total)}% errori</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2 pb-2 sm:flex-row">
        <Button asChild size="lg" className="sm:flex-1" disabled={d.lessons.allowance === 0}>
          <Link href="/lessons">Inizia le lezioni</Link>
        </Button>
        <Button asChild size="lg" variant="secondary" className="sm:flex-1">
          <Link href="/reviews">Inizia i ripassi</Link>
        </Button>
      </div>
    </div>
  );
}

function Mini({ icon, label, value, hint }: { icon?: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-surface p-4">
      <div className="flex items-center gap-2 text-xs text-muted">
        {icon}
        {label}
      </div>
      <p className="mt-2 text-xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 truncate text-[11px] text-muted">{hint}</p>}
    </div>
  );
}
