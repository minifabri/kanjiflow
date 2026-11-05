"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getStudyContext } from "@/server/study/context";
import {
  finishSession,
  getSessionState,
  overrideAttempt,
  pickExtraStudy,
  startOrResumeSession,
  submitAnswer,
  type SubmitResult,
} from "@/server/study/reviews";

export async function submitAnswerAction(input: unknown): Promise<SubmitResult> {
  const ctx = await getStudyContext();
  return submitAnswer(ctx, input);
}

export async function overrideAction(attemptId: string, addAsSynonym: boolean) {
  const ctx = await getStudyContext();
  return overrideAttempt(ctx, z.string().min(1).parse(attemptId), !!addAsSynonym);
}

export async function refreshSessionAction(sessionId: string) {
  const ctx = await getStudyContext();
  return getSessionState(ctx, z.string().min(1).parse(sessionId));
}

export async function finishSessionAction(sessionId: string) {
  const ctx = await getStudyContext();
  await finishSession(ctx, z.string().min(1).parse(sessionId));
  revalidatePath("/");
}

const extraSchema = z.object({
  band: z.enum(["", "N5", "N4", "N3"]),
  type: z.enum(["", "kanji", "vocabulary", "radical"]),
  count: z.coerce.number().int().min(5).max(100),
  burnedOnly: z.boolean(),
});

export async function startExtraStudyAction(formData: FormData) {
  const input = extraSchema.parse({
    band: formData.get("band") ?? "",
    type: formData.get("type") ?? "",
    count: formData.get("count") ?? 20,
    burnedOnly: formData.get("burnedOnly") === "on",
  });
  const ctx = await getStudyContext();
  const ids = await pickExtraStudy(ctx, { band: input.band || null, type: input.type || null, count: input.count, burnedOnly: input.burnedOnly });
  if (ids.length === 0) redirect("/reviews?extra=empty");
  await startOrResumeSession(ctx, "extra_study", { subjectIds: ids });
  redirect("/reviews/extra");
}
