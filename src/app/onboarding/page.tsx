import { prisma } from "@/server/db";
import { getStudyContext } from "@/server/study/context";
import { OnboardingWizard, type PlacementKanji } from "./wizard";

export const metadata = { title: "Configurazione iniziale" };

export default async function OnboardingPage() {
  const ctx = await getStudyContext();
  const kanji = await prisma.subject.findMany({
    where: { type: "kanji", classifications: { some: { classificationSystem: "jlpt-waller" } } },
    orderBy: { lessonOrder: "asc" },
    select: {
      id: true,
      characters: true,
      primaryMeaning: true,
      classifications: { where: { classificationSystem: "jlpt-waller" }, select: { classificationValue: true } },
      meanings: { where: { userId: null }, select: { meaning: true, language: true, isPrimary: true, isAccepted: true } },
      readings: { select: { reading: true, readingType: true, isPrimary: true, isAccepted: true } },
    },
  });
  const all: PlacementKanji[] = kanji.map((k) => ({
    id: k.id,
    characters: k.characters,
    meaning: k.primaryMeaning,
    band: k.classifications[0]?.classificationValue ?? "",
    meanings: k.meanings,
    readings: k.readings.map((r) => ({ ...r, readingType: r.readingType as PlacementKanji["readings"][number]["readingType"] })),
  }));
  const counts = { N5: 0, N4: 0, N3: 0 } as Record<string, number>;
  for (const k of all) counts[k.band] = (counts[k.band] ?? 0) + 1;
  const vocabCounts = await prisma.subjectClassification.groupBy({
    by: ["classificationValue"],
    where: { classificationSystem: "jlpt-open-anki" },
    _count: { _all: true },
  });
  return (
    <main className="mx-auto min-h-dvh max-w-3xl px-4 py-8 sm:py-12">
      <OnboardingWizard
        initialName={ctx.displayName}
        kanji={all}
        kanjiCounts={counts}
        vocabCounts={Object.fromEntries(vocabCounts.map((v) => [v.classificationValue, v._count._all]))}
        alreadyDone={!!ctx.settings.onboardingCompletedAt}
      />
    </main>
  );
}
