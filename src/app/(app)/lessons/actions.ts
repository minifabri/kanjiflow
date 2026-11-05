"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getStudyContext } from "@/server/study/context";
import { completeLessons } from "@/server/study/lessons";

export async function completeLessonsAction(ids: string[]) {
  const parsed = z.array(z.string().min(1)).min(1).max(50).parse(ids);
  const ctx = await getStudyContext();
  const count = await completeLessons(ctx, parsed);
  revalidatePath("/");
  return { count };
}
