import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/misc";
import { GrammarTextSession } from "@/components/grammar/grammar-text-session";
import { plainText } from "@/domain/reading/markup";
import { getGrammarText, listGrammarTexts, orderTexts } from "@/server/grammar/texts";
import { getStudyContext } from "@/server/study/context";

export async function generateMetadata({ params }: PageProps<"/grammar/text/[slug]">) {
  const { slug } = await params;
  const text = await getGrammarText(await getStudyContext(), slug);
  return { title: text ? plainText(text.title) : "Grammatica" };
}

export default async function GrammarTextPage({ params }: PageProps<"/grammar/text/[slug]">) {
  const { slug } = await params;
  const ctx = await getStudyContext();
  const [text, all] = await Promise.all([getGrammarText(ctx, slug), listGrammarTexts(ctx)]);
  if (!text) notFound();
  const next = orderTexts(all).find((t) => t.slug !== slug && t.attempts === 0) ?? null;
  const { lastAttempt, ...sessionText } = text;
  const fmt = new Intl.DateTimeFormat("it-IT", { timeZone: ctx.timeZone, dateStyle: "medium" });

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href="/grammar" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Grammatica
      </Link>

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="primary">{text.level}</Badge>
        <Badge variant="outline">Testo con spazi vuoti</Badge>
        <Badge variant="outline">{text.blanks.length} spazi</Badge>
        <Badge variant={text.readability.percent >= 90 ? "success" : "outline"}>
          conosci {text.readability.known} kanji su {text.readability.total}
        </Badge>
        {lastAttempt && (
          <span className="text-xs text-muted">
            Ultimo tentativo: {fmt.format(lastAttempt.completedAt)}, {lastAttempt.correctCount}/{lastAttempt.totalCount}
          </span>
        )}
      </div>

      <GrammarTextSession key={text.id} text={sessionText} defaultFurigana={ctx.settings.showFurigana ? "adaptive" : "never"} nextSlug={next?.slug ?? null} />

      <p className="text-center text-[11px] text-muted">
        Testo originale di KanjiFlow, non tratto da prove d&apos;esame ·{" "}
        <Link href="/settings/data#fonti" className="underline">
          fonti e licenze
        </Link>
      </p>
    </div>
  );
}
