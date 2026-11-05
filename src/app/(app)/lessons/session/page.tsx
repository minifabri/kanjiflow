import { redirect } from "next/navigation";
import { getStudyContext } from "@/server/study/context";
import { getLessonQueue } from "@/server/study/lessons";
import { loadSubjectCards } from "@/server/study/subjects";
import { LessonSession } from "@/components/study/lesson-session";

export const metadata = { title: "Sessione di lezioni" };

export default async function LessonSessionPage() {
  const ctx = await getStudyContext();
  const q = await getLessonQueue(ctx);
  const n = Math.min(ctx.settings.lessonBatchSize, q.allowance);
  if (n <= 0 || q.queue.length === 0) redirect("/lessons");
  const cards = await loadSubjectCards(
    q.queue.slice(0, n).map((s) => s.id),
    ctx.userId,
  );
  return (
    <LessonSession
      cards={cards}
      typoTolerance={ctx.settings.typoTolerance as "off" | "conservative" | "lenient"}
      readingFirst={ctx.settings.questionPriority === "reading_first"}
      moreAvailable={q.allowance - n > 0 && q.queue.length > n}
    />
  );
}
