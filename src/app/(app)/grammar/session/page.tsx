import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { GrammarSession } from "@/components/grammar/grammar-session";
import { getGrammarSession, type GrammarMode } from "@/server/grammar/points";
import { getStudyContext } from "@/server/study/context";

export const metadata = { title: "Grammatica" };

const MODES: GrammarMode[] = ["lesson", "review", "practice"];

export default async function GrammarSessionPage({ searchParams }: PageProps<"/grammar/session">) {
  const sp = await searchParams;
  const mode = MODES.find((m) => m === sp.mode) ?? "review";
  const slug = typeof sp.point === "string" ? sp.point : undefined;
  const ctx = await getStudyContext();
  const session = await getGrammarSession(ctx, mode, slug);
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href={slug ? `/grammar/${slug}` : "/grammar"} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> {slug ? "Scheda" : "Grammatica"}
      </Link>
      <GrammarSession
        key={`${mode}:${slug ?? ""}:${session.items.map((i) => i.sheet.id).join(",")}`}
        mode={session.mode}
        items={session.items}
        kanjiStates={session.kanjiStates}
        defaultFurigana={ctx.settings.showFurigana ? "adaptive" : "never"}
      />
    </div>
  );
}
