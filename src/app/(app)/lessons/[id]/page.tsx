import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getStudyContext } from "@/server/study/context";
import { loadSubjectCards } from "@/server/study/subjects";
import { Card, CardContent } from "@/components/ui/card";
import {
  ExamplesSection,
  MeaningSection,
  MnemonicSection,
  ReadingSection,
  RelatedSection,
  SubjectHero,
} from "@/components/study/subject-sections";

export default async function LessonDetailPage({ params }: PageProps<"/lessons/[id]">) {
  const { id } = await params;
  const ctx = await getStudyContext();
  const [card] = await loadSubjectCards([id], ctx.userId);
  if (!card) notFound();
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link href="/lessons" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Lezioni
      </Link>
      <Card>
        <CardContent className="space-y-8 py-8">
          <SubjectHero card={card} />
          <MeaningSection card={card} />
          <MnemonicSection card={card} type="meaning" />
          <ReadingSection card={card} />
          {card.type !== "radical" && <MnemonicSection card={card} type="reading" />}
          <RelatedSection card={card} />
          <ExamplesSection card={card} />
        </CardContent>
      </Card>
      <p className="text-center text-sm">
        <Link href={`/subjects/${card.id}`} className="text-secondary hover:underline">
          Apri la scheda completa (stato SRS, storico, note)
        </Link>
      </p>
    </div>
  );
}
