import "server-only";
import { prisma } from "@/server/db";
import { applyMarkKnown, type SrsStage } from "@/domain/srs";
import { localDateKey } from "@/domain/time";
import type { StudyContext } from "./context";

export type KnownMode = "maintain" | "burn";

/**
 * Segna soggetti come già conosciuti.
 * - maintain: stadio Maestro con ripassi distribuiti nei prossimi 30 giorni (mantenimento leggero);
 * - burn:     stadio Bruciato, nessun ripasso (si possono sempre ristudiare).
 * Non tocca soggetti già avviati: il progresso reale ha sempre la precedenza.
 * Con `includeComponents` segna anche i radicali dei kanji (utile nel percorso guidato).
 */
export async function markKnown(ctx: StudyContext, subjectIds: string[], mode: KnownMode, includeComponents = true, now = new Date()) {
  let ids = [...new Set(subjectIds)];
  if (includeComponents && ids.length) {
    const comps = await prisma.subjectComponent.findMany({
      where: { parentSubjectId: { in: ids }, relationshipType: "radical_of_kanji" },
      select: { componentSubjectId: true },
    });
    ids = [...new Set([...ids, ...comps.map((c) => c.componentSubjectId)])];
  }
  const target: SrsStage = mode === "burn" ? 9 : 7;
  const localDate = localDateKey(now, ctx.timeZone);
  let created = 0;
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    await prisma.$transaction(async (tx) => {
      const existing = new Set(
        (await tx.userSubjectProgress.findMany({ where: { userId: ctx.userId, subjectId: { in: chunk } }, select: { subjectId: true } })).map(
          (p) => p.subjectId,
        ),
      );
      const rows = chunk
        .filter((id) => !existing.has(id))
        .map((subjectId) => {
          const t = applyMarkKnown(target, subjectId, now, ctx.srs);
          return {
            userId: ctx.userId,
            subjectId,
            srsStage: t.nextStage,
            nextReviewAt: t.nextReviewAt,
            burnedAt: t.burned ? now : null,
            unlockedAt: now,
            lessonCompletedAt: now,
            markedKnownAt: now,
          };
        });
      if (rows.length) {
        await tx.userSubjectProgress.createMany({ data: rows });
        await tx.studyActivity.createMany({
          data: rows.map((r) => ({ userId: ctx.userId, subjectId: r.subjectId, activityType: "marked_known", localDate, timestamp: now })),
        });
      }
      created += rows.length;
    });
  }
  return created;
}

/** Soggetti di una fascia JLPT (classificazione non ufficiale), per tipo. */
export async function subjectIdsForBands(bands: string[], types: string[] = ["kanji", "vocabulary"]) {
  if (bands.length === 0) return [];
  const rows = await prisma.subjectClassification.findMany({
    where: {
      classificationSystem: { in: ["jlpt-waller", "jlpt-open-anki"] },
      classificationValue: { in: bands },
      subject: { type: { in: types } },
    },
    select: { subjectId: true },
  });
  return rows.map((r) => r.subjectId);
}

/** Converte un testo incollato (kanji in qualsiasi formato) negli id dei soggetti kanji corrispondenti. */
export async function kanjiIdsFromText(text: string) {
  const chars = [...new Set([...text].filter((c) => /\p{Script=Han}/u.test(c)))].slice(0, 3000);
  if (chars.length === 0) return { ids: [], found: [] as string[], missing: [] as string[] };
  const rows = await prisma.subject.findMany({ where: { type: "kanji", characters: { in: chars } }, select: { id: true, characters: true } });
  const found = new Set(rows.map((r) => r.characters));
  return { ids: rows.map((r) => r.id), found: [...found], missing: chars.filter((c) => !found.has(c)) };
}
