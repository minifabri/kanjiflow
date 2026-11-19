import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MeterList } from "@/components/stats/meter-list";
import { TimeChart, type ChartPoint } from "@/components/stats/time-chart";
import { TYPE_LABEL } from "@/components/study/subject-sections";
import { parseRange, percent, STATS_RANGES } from "@/domain/stats/aggregate";
import { getStudyContext } from "@/server/study/context";
import { getStatistics } from "@/server/stats/statistics";
import { cn } from "@/lib/utils";

export const metadata = { title: "Statistiche" };

const dayFmt = new Intl.DateTimeFormat("it-IT", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const shortFmt = new Intl.DateTimeFormat("it-IT", { day: "numeric", timeZone: "UTC" });
const monthDayFmt = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", timeZone: "UTC" });
const asDate = (key: string) => new Date(`${key}T12:00:00Z`);
const seconds = (ms: number | null) => (ms === null ? "—" : `${(ms / 1000).toLocaleString("it-IT", { maximumFractionDigits: 1 })} s`);
const pctText = (p: number | null) => (p === null ? "—" : `${p}%`);
const plural = (n: number, one: string, many: string) => `${n.toLocaleString("it-IT")} ${n === 1 ? one : many}`;

export default async function StatisticsPage({ searchParams }: PageProps<"/statistics">) {
  const range = parseRange((await searchParams).range);
  const ctx = await getStudyContext();
  const s = await getStatistics(ctx, range);
  const weekly = range > 30;
  const accuracy = percent(s.reviews.correct, s.reviews.total);

  const periodLabel = (b: { key: string; endKey: string }) =>
    weekly ? `${monthDayFmt.format(asDate(b.key))} – ${monthDayFmt.format(asDate(b.endKey))}` : dayFmt.format(asDate(b.key));
  const answersPoints: ChartPoint[] = s.reviews.buckets.map((b) => ({
    key: b.key,
    label: periodLabel(b),
    short: weekly ? monthDayFmt.format(asDate(b.key)) : shortFmt.format(asDate(b.key)),
    value: b.total,
    details: [
      { label: "Risposte", value: b.total.toLocaleString("it-IT") },
      { label: "Corrette", value: pctText(percent(b.correct, b.total)) },
    ],
  }));
  const accuracyPoints: ChartPoint[] = s.reviews.buckets.map((b) => ({
    ...answersPoints.find((p) => p.key === b.key)!,
    value: percent(b.correct, b.total),
    details: [
      { label: "Corrette", value: pctText(percent(b.correct, b.total)) },
      { label: "Risposte", value: b.total.toLocaleString("it-IT") },
    ],
  }));
  const forecastPoints: ChartPoint[] = s.forecast.map((f, i) => ({
    key: f.key,
    label: i === 0 ? `Oggi (${dayFmt.format(asDate(f.key))})` : dayFmt.format(asDate(f.key)),
    short: i === 0 ? "oggi" : shortFmt.format(asDate(f.key)),
    value: f.count,
    details: [
      { label: "Totale", value: f.count.toLocaleString("it-IT") },
      { label: "Kanji, vocaboli, radicali", value: f.srs.toLocaleString("it-IT") },
      { label: "Grammatica", value: f.grammar.toLocaleString("it-IT") },
    ],
  }));
  const forecastTotal = s.forecast.reduce((n, f) => n + f.count, 0);
  const histogramPoints: ChartPoint[] = s.reviews.histogram.map((h) => ({
    key: h.label,
    label: h.label,
    short: h.label,
    value: h.count,
    details: [
      { label: "Risposte", value: h.count.toLocaleString("it-IT") },
      { label: "Quota", value: pctText(percent(h.count, s.reviews.total)) },
    ],
  }));

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Statistiche</h1>
          <p className="mt-1 text-sm text-muted">Calcolate dallo storico dei ripassi, delle letture e della grammatica.</p>
        </div>
        <nav aria-label="Periodo" className="inline-flex rounded-md border border-border p-0.5">
          {STATS_RANGES.map((r) => (
            <Link
              key={r}
              href={`/statistics?range=${r}`}
              aria-current={r === range ? "true" : undefined}
              className={cn("rounded-sm px-3 py-1 text-xs text-muted transition-colors hover:text-foreground", r === range && "bg-elevated text-foreground")}
            >
              {r} giorni
            </Link>
          ))}
        </nav>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Riepilogo del periodo">
        <Tile label="Risposte nei ripassi" value={s.reviews.total.toLocaleString("it-IT")} hint={plural(s.reviews.activeDays, "giorno di ripasso", "giorni di ripasso")} />
        <Tile label="Risposte corrette" value={pctText(accuracy)} hint={s.reviews.total ? `${s.reviews.correct.toLocaleString("it-IT")} su ${s.reviews.total.toLocaleString("it-IT")}` : "Nessun ripasso nel periodo"} />
        <Tile label="Tempo di risposta" value={seconds(s.reviews.medianMs)} hint="mediana" />
        <Tile label="Serie di studio" value={plural(s.streak.current, "giorno", "giorni")} hint={`record: ${plural(s.streak.longest, "giorno", "giorni")}`} />
      </section>

      {s.reviews.total === 0 ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted">
            Nessun ripasso negli ultimi {range} giorni: i grafici compaiono dopo le prime risposte.{" "}
            <Link href="/reviews" className="text-secondary hover:underline">
              Vai ai ripassi
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Risposte {weekly ? "per settimana" : "al giorno"}</CardTitle>
              <CardDescription>Solo i ripassi SRS: lezioni e studio extra sono esclusi.</CardDescription>
            </CardHeader>
            <CardContent>
              <TimeChart points={answersPoints} kind="bar" ariaLabel={`Risposte ${weekly ? "per settimana" : "al giorno"} negli ultimi ${range} giorni`} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Risposte corrette</CardTitle>
              <CardDescription>Percentuale {weekly ? "per settimana" : "per giorno"}; la linea si interrompe dove non ci sono ripassi.</CardDescription>
            </CardHeader>
            <CardContent>
              <TimeChart points={accuracyPoints} kind="line" max={100} tickSuffix="%" ariaLabel={`Percentuale di risposte corrette negli ultimi ${range} giorni`} />
            </CardContent>
          </Card>
        </div>
      )}

      {s.reviews.byQuestion.length > 0 && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Per tipo di domanda</CardTitle>
              <CardDescription>Risposte corrette e tempo mediano nel periodo.</CardDescription>
            </CardHeader>
            <CardContent>
              <MeterList
                ariaLabel="Risposte corrette per tipo di domanda"
                rows={s.reviews.byQuestion.map((q) => ({
                  key: q.key,
                  label: q.label,
                  ratio: q.total ? q.correct / q.total : null,
                  figure: pctText(percent(q.correct, q.total)),
                  hint: `${plural(q.total, "risposta", "risposte")} · ${seconds(q.medianMs)}`,
                }))}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Tempi di risposta</CardTitle>
              <CardDescription>Quante risposte per fascia di tempo, dalla domanda all&apos;invio.</CardDescription>
            </CardHeader>
            <CardContent>
              <TimeChart points={histogramPoints} kind="bar" height={140} ariaLabel="Distribuzione dei tempi di risposta" />
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Carico previsto</CardTitle>
          <CardDescription>
            {forecastTotal === 0
              ? "Nessun ripasso nei prossimi 14 giorni."
              : `${plural(forecastTotal, "ripasso", "ripassi")} nei prossimi 14 giorni, inclusa la grammatica; quelli già scaduti contano per oggi.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TimeChart points={forecastPoints} kind="bar" height={140} ariaLabel="Ripassi previsti per giorno nei prossimi 14 giorni" />
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Errori ripetuti</CardTitle>
            <CardDescription>La stessa risposta sbagliata data almeno due volte nel periodo.</CardDescription>
          </CardHeader>
          <CardContent>
            {s.confusions.length === 0 ? (
              <p className="text-sm text-muted">Nessun errore ripetuto: ottimo segno.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-muted">
                    <tr>
                      <th className="py-1.5 pr-3 font-normal">Elemento</th>
                      <th className="py-1.5 pr-3 font-normal">Hai risposto</th>
                      <th className="py-1.5 pr-3 font-normal">Corretto</th>
                      <th className="py-1.5 text-right font-normal">Volte</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.confusions.map((c) => (
                      <tr key={`${c.subjectId}:${c.questionType}:${c.answer}`} className="border-t border-border/60">
                        <td className="py-2 pr-3">
                          <Link href={`/subjects/${c.subjectId}`} className="hover:underline">
                            <span className="kanji-display text-base" lang="ja">
                              {c.characters}
                            </span>{" "}
                            <span className="text-xs text-muted">{c.questionType === "reading" ? "lettura" : "significato"}</span>
                          </Link>
                        </td>
                        <td className={cn("py-2 pr-3 text-error", c.questionType === "reading" && "jp")}>{c.answer}</td>
                        <td className={cn("py-2 pr-3", c.questionType === "reading" && "jp")}>{c.expected}</td>
                        <td className="py-2 text-right tabular-nums">{c.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Elementi più difficili</CardTitle>
            <CardDescription>Da sempre, con almeno 4 risposte; i sospesi sono esclusi.</CardDescription>
          </CardHeader>
          <CardContent>
            {s.hardest.length === 0 ? (
              <p className="text-sm text-muted">Ancora pochi dati: servono almeno quattro risposte per elemento.</p>
            ) : (
              <MeterList
                ariaLabel="Elementi con più risposte sbagliate"
                rows={s.hardest.map((h) => ({
                  key: h.id,
                  label: `${h.characters} · ${h.meaning}`,
                  ratio: h.incorrect / h.total,
                  figure: `${percent(h.incorrect, h.total)}% sbagliate`,
                  hint: `${h.incorrect} su ${h.total} · ${TYPE_LABEL[h.type].toLowerCase()}`,
                }))}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {s.stages.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Stadi SRS</CardTitle>
            <CardDescription>Elementi nel ciclo di ripasso, sospesi esclusi. La grammatica ha una coda separata.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-left text-sm tabular-nums">
              <thead className="text-xs text-muted">
                <tr>
                  <th className="py-1.5 pr-3 font-normal">Tipo</th>
                  {["Apprendista", "Guru", "Maestro", "Illuminato", "Bruciato", "Totale"].map((h) => (
                    <th key={h} className="py-1.5 pr-3 text-right font-normal">
                      {h}
                    </th>
                  ))}
                  <th className="py-1.5 pl-3 font-normal">A Guru o oltre</th>
                </tr>
              </thead>
              <tbody>
                {s.stages.map(({ label, row }) => {
                  const p = percent(row.passed, row.total);
                  return (
                    <tr key={label} className="border-t border-border/60">
                      <td className="py-2 pr-3">{label}</td>
                      {[row.apprentice, row.guru, row.master, row.enlightened, row.burned, row.total].map((v, i) => (
                        <td key={i} className={cn("py-2 pr-3 text-right", i === 5 && "font-medium")}>
                          {v.toLocaleString("it-IT")}
                        </td>
                      ))}
                      <td className="py-2 pl-3">
                        <span className="flex items-center gap-2">
                          <span className="h-2 w-20 overflow-hidden rounded-full bg-elevated" aria-hidden>
                            <span className="block h-full rounded-full bg-chart" style={{ width: `${p ?? 0}%` }} />
                          </span>
                          <span className="text-xs">{pctText(p)}</span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <section className="grid gap-5 lg:grid-cols-2" aria-label="Lettura e grammatica">
        <Card>
          <CardHeader>
            <CardTitle>Lettura</CardTitle>
            <CardDescription>Ultimi {range} giorni, brani riletti inclusi.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-3">
            <Mini label="Brani letti" value={s.reading.passages.toLocaleString("it-IT")} hint={plural(s.reading.attempts, "lettura", "letture")} />
            <Mini label="Domande corrette" value={pctText(percent(s.reading.correct, s.reading.total))} hint={s.reading.total ? `${s.reading.correct} su ${s.reading.total}` : "—"} />
            <Mini label="Tempo per brano" value={s.reading.medianMs === null ? "—" : `${Math.max(1, Math.round(s.reading.medianMs / 60000))} min`} hint="mediana" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Grammatica</CardTitle>
            <CardDescription>Ultimi {range} giorni.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-3">
            <Mini label="Ripassi" value={s.grammar.reviews.toLocaleString("it-IT")} hint="esercizi SRS" />
            <Mini label="Ripassi corretti" value={pctText(percent(s.grammar.correct, s.grammar.reviews))} hint={s.grammar.reviews ? `${s.grammar.correct} su ${s.grammar.reviews}` : "—"} />
            <Mini label="Testi con spazi" value={s.grammar.texts.toLocaleString("it-IT")} hint={s.grammar.textTotal ? `${percent(s.grammar.textCorrect, s.grammar.textTotal)}% spazi corretti` : "nessuno svolto"} />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-surface p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 truncate text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

function Mini({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 rounded-md bg-elevated/50 p-3">
      <p className="text-[11px] leading-tight text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-[11px] leading-tight text-muted">{hint}</p>}
    </div>
  );
}
