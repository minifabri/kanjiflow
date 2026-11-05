import Link from "next/link";
import { BookOpen } from "lucide-react";
import { prisma } from "@/server/db";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/misc";
import { TYPE_STYLE, TYPE_LABEL } from "@/components/study/subject-sections";
import { getStudyContext } from "@/server/study/context";
import { getLessonQueue } from "@/server/study/lessons";
import { cn } from "@/lib/utils";

export const metadata = { title: "Lezioni" };

const PATH_LABEL = { jlpt: "Percorso JLPT", guided: "Percorso guidato", custom: "Percorso personalizzato" } as const;

export default async function LessonsPage() {
  const ctx = await getStudyContext();
  const q = await getLessonQueue(ctx);
  const preview = q.queue.slice(0, 40);
  const subjects = await prisma.subject.findMany({
    where: { id: { in: preview.map((s) => s.id) } },
    select: { id: true, type: true, characters: true, primaryMeaning: true },
  });
  const byId = new Map(subjects.map((s) => [s.id, s]));
  const recent = await prisma.userSubjectProgress.findMany({
    where: { userId: ctx.userId, lessonCompletedAt: { not: null }, markedKnownAt: null },
    orderBy: { lessonCompletedAt: "desc" },
    take: 24,
    select: { subject: { select: { id: true, type: true, characters: true, primaryMeaning: true } } },
  });
  const batch = Math.min(ctx.settings.lessonBatchSize, q.allowance);
  const path = ctx.settings.studyPath as keyof typeof PATH_LABEL;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Lezioni</h1>
          <p className="mt-1 text-sm text-muted">
            {PATH_LABEL[path]} · obiettivo {ctx.settings.targetJlpt} · {q.lessonsCompletedToday}/{ctx.settings.dailyLessonLimit} oggi
          </p>
        </div>
        <Badge variant="outline">{q.totalAvailable} disponibili</Badge>
      </header>

      <Card>
        <CardContent className="flex flex-col gap-4 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-md bg-primary/15 text-primary">
              <BookOpen className="size-5" aria-hidden />
            </span>
            <div>
              <p className="font-medium">{q.allowance > 0 ? `${batch} lezioni nel prossimo gruppo` : "Nessuna nuova lezione per ora"}</p>
              <p className="text-xs text-muted">
                {q.allowance > 0
                  ? `Puoi ancora iniziarne ${Math.min(q.allowance, q.totalAvailable)} oggi.`
                  : q.totalAvailable === 0
                    ? path === "custom"
                      ? "Aggiungi soggetti a una raccolta attiva."
                      : "Completa i ripassi: nuovi vocaboli si sbloccano quando i loro kanji arrivano a Guru."
                    : q.apprenticeCount >= ctx.settings.maxApprenticeItems
                      ? `Hai ${q.apprenticeCount} elementi Apprendista (limite ${ctx.settings.maxApprenticeItems}): ripassa prima di aggiungerne altri.`
                      : "Limite giornaliero raggiunto. Torna domani o alzalo nelle impostazioni."}
              </p>
            </div>
          </div>
          {q.allowance > 0 && q.totalAvailable > 0 && (
            <Button asChild size="lg">
              <Link href="/lessons/session">Inizia le lezioni</Link>
            </Button>
          )}
        </CardContent>
      </Card>

      {preview.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>In coda</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-wrap gap-2">
              {preview.map((p) => {
                const s = byId.get(p.id);
                if (!s) return null;
                return (
                  <li key={p.id}>
                    <Link
                      href={`/lessons/${s.id}`}
                      title={`${TYPE_LABEL[s.type as keyof typeof TYPE_LABEL]}: ${s.primaryMeaning}`}
                      className={cn("kanji-display inline-flex min-w-10 items-center justify-center rounded-md px-2 py-1.5 text-lg", TYPE_STYLE[s.type as keyof typeof TYPE_STYLE])}
                    >
                      {s.characters}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      {recent.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Rivedi le lezioni recenti</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {recent.map(({ subject: s }) => (
                <li key={s.id}>
                  <Link href={`/lessons/${s.id}`} className="flex items-center gap-2.5 rounded-md bg-elevated/50 p-2 hover:bg-elevated">
                    <span className="kanji-display text-xl">{s.characters}</span>
                    <span className="truncate text-xs text-muted">{s.primaryMeaning}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
