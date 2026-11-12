import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/misc";
import { PassageReader } from "@/components/reading/passage-reader";
import { FORMAT_LABEL, FORMAT_SECONDS } from "@/domain/reading/content";
import { plainText } from "@/domain/reading/markup";
import { getStudyContext } from "@/server/study/context";
import { getPassage, listPassages, recommendPassages } from "@/server/reading/passages";

export async function generateMetadata({ params }: PageProps<"/reading/[slug]">) {
  const { slug } = await params;
  const passage = await getPassage(await getStudyContext(), slug);
  return { title: passage ? plainText(passage.title) : "Lettura" };
}

export default async function PassagePage({ params, searchParams }: PageProps<"/reading/[slug]">) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const ctx = await getStudyContext();
  const [passage, all] = await Promise.all([getPassage(ctx, slug), listPassages(ctx)]);
  if (!passage) notFound();
  const exam = sp.mode === "exam";
  const next = recommendPassages(all).find((p) => p.slug !== slug && p.attempts === 0) ?? null;
  const last = passage.attempts[0];
  const fmt = new Intl.DateTimeFormat("it-IT", { timeZone: ctx.timeZone, dateStyle: "medium" });
  const { attempts: _attempts, ...readerPassage } = passage;
  void _attempts;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/reading" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> Lettura
        </Link>
        <Link href={exam ? `/reading/${slug}` : `/reading/${slug}?mode=exam`} className="text-xs text-secondary hover:underline">
          {exam ? "Torna alla modalità studio" : `Modalità esame (${Math.round(FORMAT_SECONDS[passage.format] / 60)} min, senza aiuti) →`}
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="primary">{passage.level}</Badge>
        <Badge variant="outline">{FORMAT_LABEL[passage.format]}</Badge>
        <Badge variant="outline">{passage.charCount} caratteri</Badge>
        {exam ? (
          <Badge variant="gold">Modalità esame</Badge>
        ) : (
          <Badge variant={passage.readability.percent >= 90 ? "success" : "outline"}>
            conosci {passage.readability.known} kanji su {passage.readability.total}
          </Badge>
        )}
        {last && (
          <span className="text-xs text-muted">
            Ultima lettura: {fmt.format(last.completedAt)}, {last.correctCount}/{last.totalCount}
          </span>
        )}
      </div>

      {/* La chiave azzera lo stato del lettore quando si cambia brano o modalità. */}
      <PassageReader
        key={`${passage.id}:${exam}`}
        passage={readerPassage}
        exam={exam}
        defaultFurigana={ctx.settings.showFurigana ? "adaptive" : "never"}
        nextSlug={next?.slug ?? null}
      />

      <p className="text-center text-[11px] text-muted">
        Testo originale di KanjiFlow, non tratto da prove d&apos;esame ·{" "}
        <Link href="/settings/data#fonti" className="underline">
          fonti e licenze
        </Link>
      </p>
    </div>
  );
}
