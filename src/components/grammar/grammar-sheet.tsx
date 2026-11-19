/** Scheda di un punto grammaticale: usata nella pagina del punto e nelle lezioni. */
import { SpeakButton } from "@/components/study/speak-button";
import { RubyText } from "@/components/reading/ruby-text";
import { kanaText, type RubySegment } from "@/domain/reading/markup";
import type { GrammarSheet as Sheet } from "@/server/grammar/points";

export function GrammarSheet({ sheet, furigana }: { sheet: Sheet; furigana: boolean | ((segment: RubySegment) => boolean) }) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <p className="text-3xl font-medium leading-relaxed sm:text-4xl">
          <RubyText segments={sheet.title} furigana={furigana} />
        </p>
        <p className="mt-2 text-base text-secondary">{sheet.meaning}</p>
      </div>
      <section>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">Come si forma</h3>
        <p className="rounded-md bg-elevated/60 px-3 py-2.5 text-[15px] leading-loose">
          <RubyText segments={sheet.structure} furigana={furigana} />
        </p>
      </section>
      <section>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">Quando si usa</h3>
        <p className="text-sm leading-relaxed">{sheet.explanation}</p>
      </section>
      <section>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">Esempi</h3>
        <ul className="space-y-3">
          {sheet.examples.map((e, i) => (
            <li key={i} className="flex items-start gap-2 rounded-md bg-elevated/40 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-[17px] leading-[2.2]">
                  <RubyText segments={e.ja} furigana={furigana} />
                </p>
                <p className="text-sm text-muted">{e.it}</p>
              </div>
              <SpeakButton text={kanaText(e.ja)} size="sm" className="mt-1 shrink-0" />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
