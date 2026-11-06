import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/server/db";
import { getStudyContext } from "@/server/study/context";
import { loadSubjectCards } from "@/server/study/subjects";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/misc";
import {
  ExamplesSection,
  MeaningSection,
  MnemonicSection,
  ReadingSection,
  RelatedSection,
  SubjectHero,
} from "@/components/study/subject-sections";
import { MnemonicEditor, NoteEditor, SubjectActions, SynonymEditor } from "@/components/study/subject-editors";
import { stageLabel, type SrsStage } from "@/domain/srs";

export default async function SubjectPage({ params }: PageProps<"/subjects/[id]">) {
  const { id } = await params;
  const ctx = await getStudyContext();
  const [card] = await loadSubjectCards([id], ctx.userId, { usedInLimit: 40 });
  if (!card) notFound();
  const [progress, attempts, transitions, source] = await Promise.all([
    prisma.userSubjectProgress.findUnique({ where: { userId_subjectId: { userId: ctx.userId, subjectId: id } } }),
    prisma.reviewAttempt.findMany({
      where: { subjectId: id, session: { userId: ctx.userId } },
      orderBy: { attemptedAt: "desc" },
      take: 30,
      include: { session: { select: { kind: true } } },
    }),
    prisma.reviewTransition.findMany({ where: { subjectId: id, userId: ctx.userId }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.subject.findUnique({ where: { id }, select: { contentVersion: true, contentSource: { select: { name: true, license: true } } } }),
  ]);
  const fmt = new Intl.DateTimeFormat("it-IT", { timeZone: ctx.timeZone, dateStyle: "medium", timeStyle: "short" });
  const userSynonyms = card.meanings.filter((m) => m.origin === "user").map((m) => m.meaning);
  const userMn = (t: string) => card.mnemonics.find((m) => m.isUser && m.type === t)?.content ?? "";

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href="/subjects" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Esplora
      </Link>

      <Card>
        <CardContent className="space-y-8 py-8">
          <SubjectHero card={card} />
          <div className="flex flex-wrap justify-center gap-2 text-xs text-muted">
            {card.strokeCount && <Badge variant="outline">{card.strokeCount} tratti</Badge>}
            {card.frequencyRank && <Badge variant="outline">frequenza n. {card.frequencyRank}</Badge>}
            <Badge variant={progress?.suspendedAt ? "error" : progress ? "primary" : "outline"}>
              {progress ? (progress.suspendedAt ? "Sospeso · " : "") + stageLabel(progress.srsStage as SrsStage) : "Non ancora studiato"}
            </Badge>
          </div>
          <MeaningSection card={card} />
          <ReadingSection card={card} />
          <RelatedSection card={card} />
          <ExamplesSection card={card} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Stato SRS</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {progress ? (
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <Stat label="Stadio" value={stageLabel(progress.srsStage as SrsStage)} />
              <Stat label="Prossimo ripasso" value={progress.nextReviewAt ? fmt.format(progress.nextReviewAt) : progress.srsStage === 9 ? "—" : "ora"} />
              <Stat label="Significato" value={`${progress.meaningCorrectCount} ✓ · ${progress.meaningIncorrectCount} ✗`} />
              <Stat label="Lettura" value={card.type === "radical" ? "—" : `${progress.readingCorrectCount} ✓ · ${progress.readingIncorrectCount} ✗`} />
              {progress.markedKnownAt && <Stat label="Segnato come noto" value={fmt.format(progress.markedKnownAt)} />}
              {progress.burnedAt && <Stat label="Bruciato il" value={fmt.format(progress.burnedAt)} />}
            </dl>
          ) : (
            <p className="text-sm text-muted">
              Non è ancora nel ciclo di ripasso.{" "}
              <Link href={`/lessons/${card.id}`} className="text-secondary hover:underline">
                Apri la lezione
              </Link>
              .
            </p>
          )}
          <SubjectActions subjectId={card.id} stage={progress?.srsStage ?? null} suspended={!!progress?.suspendedAt} started={!!progress} />
        </CardContent>
      </Card>

      <Card id="mnemonici">
        <CardHeader>
          <CardTitle>Mnemonici, sinonimi e note</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <MnemonicSection card={card} type="meaning" />
          <MnemonicEditor subjectId={card.id} type="meaning" initial={userMn("meaning")} />
          {card.type !== "radical" && (
            <>
              <MnemonicSection card={card} type="reading" />
              <MnemonicEditor subjectId={card.id} type="reading" initial={userMn("reading")} />
            </>
          )}
          <div className="space-y-2">
            <p className="text-xs text-muted">Sinonimi personali (accettati nelle risposte, mai sovrascritti dagli aggiornamenti del dataset)</p>
            <SynonymEditor subjectId={card.id} userSynonyms={userSynonyms} />
          </div>
          <div className="space-y-2">
            <p className="text-xs text-muted">Nota personale</p>
            <NoteEditor subjectId={card.id} initial={card.note ?? ""} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Storico</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {transitions.length === 0 && attempts.length === 0 ? (
            <p className="text-sm text-muted">Nessun ripasso registrato.</p>
          ) : (
            <>
              {transitions.length > 0 && (
                <ul className="space-y-1 text-sm">
                  {transitions.map((t) => (
                    <li key={t.id} className="flex flex-wrap justify-between gap-2">
                      <span className={t.nextStage > t.previousStage ? "text-success" : "text-error"}>
                        {stageLabel(t.previousStage as SrsStage)} → {stageLabel(t.nextStage as SrsStage)}
                      </span>
                      <span className="text-muted">{fmt.format(t.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <details>
                <summary className="cursor-pointer text-xs text-muted">Ultime risposte ({attempts.length})</summary>
                <ul className="mt-2 space-y-1 text-xs">
                  {attempts.map((a) => (
                    <li key={a.id} className="flex flex-wrap justify-between gap-2">
                      <span>
                        <span className={a.isCorrect ? "text-success" : "text-error"}>{a.isCorrect ? "✓" : "✗"}</span>{" "}
                        {a.questionType === "meaning" ? "significato" : "lettura"}: <span className="jp">{a.submittedAnswer || "—"}</span>
                        {a.overridden && <span className="ml-1 text-gold">(corretta manualmente)</span>}
                        {a.session.kind === "extra_study" && <span className="ml-1 text-muted">(studio extra)</span>}
                      </span>
                      <span className="text-muted">{fmt.format(a.attemptedAt)}</span>
                    </li>
                  ))}
                </ul>
              </details>
            </>
          )}
        </CardContent>
      </Card>

      {source && (
        <p className="text-center text-[11px] text-muted">
          Fonte: {source.contentSource.name} · {source.contentSource.license} · dataset v{source.contentVersion} ·{" "}
          <Link href="/settings/data#fonti" className="underline">
            attribuzioni
          </Link>
        </p>
      )}
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
