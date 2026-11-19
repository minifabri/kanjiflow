/** Testo giapponese con furigana: usato sia nelle pagine server sia nel lettore interattivo. */
import { isRuby, type RubySegment, type Segment } from "@/domain/reading/markup";
import { cn } from "@/lib/utils";

export function RubyText({
  segments,
  furigana,
  onWord,
  activeIndex,
  className,
}: {
  segments: readonly Segment[];
  /** true/false per tutto il testo, oppure una regola parola per parola (furigana adattivo). */
  furigana: boolean | ((segment: RubySegment) => boolean);
  /** Se presente, le parole annotate diventano pulsanti. */
  onWord?: (segment: RubySegment, index: number) => void;
  activeIndex?: number | null;
  className?: string;
}) {
  return (
    <span className={cn("jp", className)} lang="ja">
      {segments.map((s, i) => {
        if (!isRuby(s)) return <span key={i}>{s.t}</span>;
        const show = typeof furigana === "function" ? furigana(s) : furigana;
        const ruby = (
          <ruby>
            {s.b}
            {show && <rt className="select-none text-[0.5em] font-normal text-muted">{s.r}</rt>}
          </ruby>
        );
        if (!onWord) return <span key={i}>{ruby}</span>;
        return (
          <button
            key={i}
            type="button"
            onClick={() => onWord(s, i)}
            aria-label={`${s.b}, apri la scheda`}
            aria-pressed={activeIndex === i}
            className={cn(
              "rounded-sm decoration-border decoration-dotted underline-offset-[5px] transition-colors hover:bg-elevated hover:underline",
              activeIndex === i && "bg-primary/20 text-foreground",
            )}
          >
            {ruby}
          </button>
        );
      })}
    </span>
  );
}
