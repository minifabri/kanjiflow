import "server-only";
import { prisma } from "@/server/db";
import { applyResurrection, assertSrsStage } from "@/domain/srs";
import { localDateKey } from "@/domain/time";
import type { StudyContext } from "./context";
import { invalidateMeaningIndex } from "./subjects";

async function activity(ctx: StudyContext, subjectId: string, activityType: string, now: Date) {
  await prisma.studyActivity.create({ data: { userId: ctx.userId, subjectId, activityType, localDate: localDateKey(now, ctx.timeZone), timestamp: now } });
}

export async function suspendSubject(ctx: StudyContext, subjectId: string, suspend: boolean, now = new Date()) {
  const p = await prisma.userSubjectProgress.findUnique({ where: { userId_subjectId: { userId: ctx.userId, subjectId } } });
  if (!p) throw new Error("Elemento non ancora studiato");
  await prisma.userSubjectProgress.update({ where: { id: p.id }, data: { suspendedAt: suspend ? now : null } });
  await activity(ctx, subjectId, suspend ? "suspended" : "unsuspended", now);
}

/** Reimposta: elimina il progresso, il soggetto torna in coda lezioni. Lo storico dei ripassi resta. */
export async function resetSubject(ctx: StudyContext, subjectId: string, now = new Date()) {
  await prisma.userSubjectProgress.deleteMany({ where: { userId: ctx.userId, subjectId } });
  await activity(ctx, subjectId, "reset", now);
}

export async function resurrectSubject(ctx: StudyContext, subjectId: string, now = new Date()) {
  const p = await prisma.userSubjectProgress.findUniqueOrThrow({ where: { userId_subjectId: { userId: ctx.userId, subjectId } } });
  const t = applyResurrection(assertSrsStage(p.srsStage), now, ctx.srs);
  await prisma.userSubjectProgress.update({
    where: { id: p.id },
    data: { srsStage: t.nextStage, nextReviewAt: t.nextReviewAt, burnedAt: null, markedKnownAt: null },
  });
  await activity(ctx, subjectId, "resurrected", now);
}

export async function saveNote(ctx: StudyContext, subjectId: string, content: string) {
  const text = content.trim().slice(0, 5000);
  if (!text) {
    await prisma.userNote.deleteMany({ where: { userId: ctx.userId, subjectId } });
    return;
  }
  await prisma.userNote.upsert({
    where: { userId_subjectId: { userId: ctx.userId, subjectId } },
    create: { userId: ctx.userId, subjectId, content: text },
    update: { content: text },
  });
}

export async function saveMnemonic(ctx: StudyContext, subjectId: string, type: "meaning" | "reading", content: string) {
  const text = content.trim().slice(0, 2000);
  const existing = await prisma.mnemonic.findFirst({ where: { userId: ctx.userId, subjectId, mnemonicType: type } });
  if (!text) {
    if (existing) await prisma.mnemonic.delete({ where: { id: existing.id } });
    return;
  }
  if (existing) await prisma.mnemonic.update({ where: { id: existing.id }, data: { content: text } });
  else await prisma.mnemonic.create({ data: { subjectId, userId: ctx.userId, mnemonicType: type, language: "it", content: text, sourceType: "user" } });
}

export async function addSynonym(ctx: StudyContext, subjectId: string, meaning: string) {
  const m = meaning.trim().toLocaleLowerCase("it").slice(0, 80);
  if (!m) return;
  await prisma.subjectMeaning.upsert({
    where: { subjectId_language_meaning_origin_userId: { subjectId, language: "it", meaning: m, origin: "user", userId: ctx.userId } },
    create: { subjectId, userId: ctx.userId, language: "it", meaning: m, isPrimary: false, isAccepted: true, origin: "user", position: 999 },
    update: { isAccepted: true },
  });
  invalidateMeaningIndex();
}

export async function removeSynonym(ctx: StudyContext, subjectId: string, meaning: string) {
  await prisma.subjectMeaning.deleteMany({ where: { subjectId, userId: ctx.userId, origin: "user", meaning } });
  invalidateMeaningIndex();
}
