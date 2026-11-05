import { BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("grid size-8 place-items-center rounded-md bg-primary text-on-primary", className)} aria-hidden>
      <BookOpen className="size-[18px]" strokeWidth={2.2} />
    </span>
  );
}
