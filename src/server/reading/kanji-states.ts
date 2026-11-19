import "server-only";
import { prisma } from "@/server/db";
import { kanjiState, type KanjiState } from "@/domain/reading/readability";

/** Stato (conosciuto / in apprendimento) dei kanji indicati: quelli assenti dalla mappa sono "nuovi". */
export async function loadKanjiStates(userId: string, kanjiIds: readonly string[]): Promise<Record<string, KanjiState>> {
  if (kanjiIds.length === 0) return {};
  const rows = await prisma.userSubjectProgress.findMany({
    where: { userId, subjectId: { in: [...kanjiIds] } },
    select: { subjectId: true, srsStage: true, markedKnownAt: true, suspendedAt: true },
  });
  return Object.fromEntries(
    rows.map((r) => [r.subjectId, kanjiState({ stage: r.srsStage, markedKnown: !!r.markedKnownAt, suspended: !!r.suspendedAt })]),
  );
}
