"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getStudyContext } from "@/server/study/context";
import { answerGrammar, markGrammarKnown, resetGrammarPoint } from "@/server/grammar/points";

const answerSchema = z.object({
  clientAttemptId: z.string().min(8).max(64),
  exerciseId: z.string().min(1),
  chosenIndex: z.number().int().min(0).max(3),
  mode: z.enum(["lesson", "review", "practice"]),
});

export async function answerGrammarAction(input: z.input<typeof answerSchema>) {
  // Nessun revalidatePath: la sessione resta montata; le pagine sono dinamiche.
  return answerGrammar(await getStudyContext(), answerSchema.parse(input));
}

export async function markGrammarKnownAction(pointId: string, slug: string) {
  await markGrammarKnown(await getStudyContext(), z.string().min(1).parse(pointId));
  revalidatePath(`/grammar/${slug}`);
  revalidatePath("/grammar");
}

export async function resetGrammarPointAction(pointId: string, slug: string) {
  await resetGrammarPoint(await getStudyContext(), z.string().min(1).parse(pointId));
  revalidatePath(`/grammar/${slug}`);
  revalidatePath("/grammar");
}
