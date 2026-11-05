"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { getStudyContext } from "@/server/study/context";
import { kanjiIdsFromText, markKnown, subjectIdsForBands } from "@/server/study/known";

const onboardingSchema = z.object({
  displayName: z.string().trim().min(1).max(40),
  targetJlpt: z.enum(["N5", "N4", "N3", "N2", "N1"]),
  studyPath: z.enum(["guided", "jlpt", "custom"]),
  dailyLessonLimit: z.number().int().min(0).max(100),
  knownBands: z.array(z.enum(["N5", "N4", "N3"])),
  knownMode: z.enum(["maintain", "burn"]),
  knownKanjiIds: z.array(z.string()).max(3000),
  pastedText: z.string().max(20000),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;

export async function completeOnboarding(raw: OnboardingInput) {
  const input = onboardingSchema.parse(raw);
  const ctx = await getStudyContext();
  await prisma.user.update({ where: { id: ctx.userId }, data: { displayName: input.displayName } });
  await prisma.userSettings.update({
    where: { userId: ctx.userId },
    data: { targetJlpt: input.targetJlpt, studyPath: input.studyPath, dailyLessonLimit: input.dailyLessonLimit },
  });

  const bandIds = await subjectIdsForBands(input.knownBands);
  const pasted = await kanjiIdsFromText(input.pastedText);
  const ids = [...new Set([...bandIds, ...input.knownKanjiIds, ...pasted.ids])];
  const marked = ids.length ? await markKnown(ctx, ids, input.knownMode) : 0;

  await prisma.userSettings.update({ where: { userId: ctx.userId }, data: { onboardingCompletedAt: new Date() } });
  return { marked, missing: pasted.missing };
}

export async function previewPasted(text: string) {
  const r = await kanjiIdsFromText(text);
  return { found: r.found.length, missing: r.missing.slice(0, 40), missingCount: r.missing.length };
}

export async function finishOnboarding() {
  redirect("/");
}
