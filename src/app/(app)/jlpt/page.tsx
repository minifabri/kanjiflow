import Link from "next/link";
import { prisma } from "@/server/db";
import { getStudyContext } from "@/server/study/context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/misc";
import { isPassedProgress } from "@/domain/curriculum/lesson-queue";
import { ExtraStudyForm } from "@/components/study/extra-study-form";

export const metadata = { title: "Progressi JLPT" };

export default async function JlptPage() {
  const ctx = await getStudyContext();
  const [classes, progress] = await Promise.all([
    prisma.subjectClassification.findMany({
      where: { classificationSystem: { in: ["jlpt-waller", "jlpt-open-anki"] } },
      select: { subjectId: true, classificationValue: true, subject: { select: { type: true } } },
    }),
    prisma.userSubjectProgress.findMany({
      where: { userId: ctx.userId },
      select: { subjectId: true, srsStage: true, markedKnownAt: true, suspendedAt: true },
    }),
  ]);
  const pmap = new Map(progress.map((p) => [p.subjectId, p]));
  const bands = ["N5", "N4", "N3"].map((band) => {
    const row = (type: string) => {
      const ids = classes.filter((c) => c.classificationValue === band && c.subject.type === type).map((c) => c.subjectId);
      let started = 0;
      let passed = 0;
      let known = 0;
      for (const id of ids) {
        const p = pmap.get(id);
        if (!p) continue;
        started++;
        if (p.markedKnownAt) known++;
        if (isPassedProgress({ stage: p.srsStage, markedKnown: !!p.markedKnownAt, suspended: !!p.suspendedAt })) passed++;
      }
      return { total: ids.length, started, passed, known };
    };
    return { band, kanji: row("kanji"), vocab: row("vocabulary") };
  });

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Progressi JLPT</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Il JLPT non pubblica elenchi ufficiali di kanji o vocaboli dal 2010. Le fasce qui sotto seguono liste della community (Jonathan Waller, tanos.co.uk)
          e sono indicative: puoi creare liste personali nelle raccolte.
        </p>
      </header>
      <div className="grid gap-4 md:grid-cols-3">
        {bands.map((b) => (
          <Card key={b.band} className={b.band === ctx.settings.targetJlpt ? "border-primary/50" : undefined}>
            <CardHeader>
              <CardTitle className="text-base">{b.band}</CardTitle>
              <CardDescription>
                {b.band === ctx.settings.targetJlpt
                  ? "Obiettivo attuale"
                  : Number(b.band.slice(1)) < Number(ctx.settings.targetJlpt.slice(1))
                    ? "Livello successivo"
                    : "Fascia di mantenimento"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <BandRow label="Kanji" {...b.kanji} />
              <BandRow label="Vocaboli" {...b.vocab} />
              <Link href={`/subjects?band=${b.band}&type=kanji&stage=none`} className="block text-xs text-secondary hover:underline">
                Kanji {b.band} non ancora studiati →
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
      <ExtraStudyForm />
    </div>
  );
}

function BandRow({ label, total, started, passed, known }: { label: string; total: number; started: number; passed: number; known: number }) {
  const pct = total ? Math.round((passed / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span>{label}</span>
        <span className="tabular-nums text-muted">
          {passed}/{total} · {pct}%
        </span>
      </div>
      <Progress value={pct} className="mt-1.5" aria-label={`${label}: ${pct}% superati`} />
      <p className="mt-1 text-[11px] text-muted">
        {started} avviati{known > 0 && ` · ${known} segnati come noti`}
      </p>
    </div>
  );
}
