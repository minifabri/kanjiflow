"use server";

import { z } from "zod";
import { getStudyContext } from "@/server/study/context";
import { getSparkState, recordSparkAnswer, type SparkState, type SparkSummary } from "@/server/study/spark";

const answerSchema = z.object({ subjectId: z.string().min(1).max(64), correct: z.boolean() });

export async function answerSparkAction(input: unknown): Promise<SparkSummary> {
  const { subjectId, correct } = answerSchema.parse(input);
  const ctx = await getStudyContext();
  return recordSparkAnswer(ctx, subjectId, correct);
}

/** Un'altra domanda subito, oltre a quella della fascia oraria. */
export async function nextSparkAction(): Promise<SparkState> {
  const ctx = await getStudyContext();
  return getSparkState(ctx, new Date(), true);
}
