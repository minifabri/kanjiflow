import { cn } from "@/lib/utils";
import { TYPE_LABEL } from "./subject-sections";

/** Banda che distingue chiaramente il tipo di domanda: significato (neutra) o lettura (lavanda). */
export function QuestionBanner({ type, question }: { type: "radical" | "kanji" | "vocabulary"; question: "meaning" | "reading" }) {
  const label = question === "meaning" ? "Significato" : type === "kanji" ? "Lettura del kanji" : "Lettura";
  return (
    <div
      className={cn(
        "border-y border-border/60 py-2.5 text-center text-sm font-medium",
        question === "reading" ? "bg-primary/15 text-secondary" : "bg-elevated text-foreground",
      )}
    >
      {TYPE_LABEL[type]} · <span className={question === "reading" ? "text-primary" : ""}>{label}</span>
    </div>
  );
}
