"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getStudyContext } from "@/server/study/context";
import { prioritizeLessons, submitReading } from "@/server/reading/passages";

const submissionSchema = z.object({
  passageId: z.string().min(1),
  mode: z.enum(["study", "exam"]),
  answers: z.array(z.number().int().min(0).max(3).nullable()).max(20),
  lookups: z.array(z.string().min(1)).max(500),
  durationMs: z.number().int().min(0),
});

export async function submitReadingAction(input: z.input<typeof submissionSchema>) {
  const parsed = submissionSchema.parse(input);
  // Nessun revalidatePath: il riepilogo resta montato; le pagine sono dinamiche.
  return submitReading(await getStudyContext(), parsed);
}

export async function prioritizeLessonsAction(subjectIds: string[]) {
  const ids = z.array(z.string().min(1)).min(1).max(100).parse(subjectIds);
  const count = await prioritizeLessons(await getStudyContext(), ids);
  revalidatePath("/lessons");
  return { count };
}
