import Link from "next/link";
import { Search } from "lucide-react";
import { prisma } from "@/server/db";
import { getStudyContext } from "@/server/study/context";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/misc";
import { TYPE_STYLE } from "@/components/study/subject-sections";
import { looksLikeRomaji, romajiToHiragana, katakanaToHiragana } from "@/domain/answers";
import { stageLabel, type SrsStage } from "@/domain/srs";
import type { Prisma } from "@/generated/prisma/client";
import { cn } from "@/lib/utils";

export const metadata = { title: "Esplora" };

const PAGE = 60;
const STAGE_FILTERS: Record<string, { label: string; where: Prisma.UserSubjectProgressWhereInput | null }> = {
  "": { label: "Tutti gli stadi", where: null },
  none: { label: "Non studiati", where: null },
  apprentice: { label: "Apprendista", where: { srsStage: { gte: 1, lte: 4 } } },
  guru: { label: "Guru", where: { srsStage: { gte: 5, lte: 6 } } },
  master: { label: "Maestro", where: { srsStage: 7 } },
  enlightened: { label: "Illuminato", where: { srsStage: 8 } },
  burned: { label: "Bruciato", where: { srsStage: 9 } },
  suspended: { label: "Sospesi", where: { suspendedAt: { not: null } } },
};

export default async function SubjectsPage({ searchParams }: PageProps<"/subjects">) {
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const q = str("q").trim().slice(0, 50);
  const type = ["radical", "kanji", "vocabulary"].includes(str("type")) ? str("type") : "";
  const band = ["N5", "N4", "N3"].includes(str("band")) ? str("band") : "";
  const stage = str("stage") in STAGE_FILTERS ? str("stage") : "";
  const page = Math.max(1, Number(str("page")) || 1);
  const ctx = await getStudyContext();

  const and: Prisma.SubjectWhereInput[] = [];
  if (type) and.push({ type });
  if (band) and.push({ classifications: { some: { classificationSystem: { in: ["jlpt-waller", "jlpt-open-anki"] }, classificationValue: band } } });
  if (stage === "none") and.push({ progress: { none: { userId: ctx.userId } } });
  else if (STAGE_FILTERS[stage]?.where) and.push({ progress: { some: { userId: ctx.userId, ...STAGE_FILTERS[stage]!.where } } });
  if (q) {
    const kana = looksLikeRomaji(q) ? romajiToHiragana(q) : katakanaToHiragana(q);
    const or: Prisma.SubjectWhereInput[] = [
      { characters: { contains: q } },
      { meanings: { some: { meaning: { contains: q.toLocaleLowerCase("it") }, OR: [{ userId: null }, { userId: ctx.userId }] } } },
    ];
    if (/^[ぁ-ゖー]+$/.test(kana)) or.push({ readings: { some: { reading: { contains: kana } } } });
    // Ricerca per radicale/componente: soggetti che contengono il carattere cercato come componente.
    if ([...q].length === 1) or.push({ components: { some: { component: { characters: q } } } });
    and.push({ OR: or });
  }
  const where: Prisma.SubjectWhereInput = and.length ? { AND: and } : {};
  const [total, rows] = await Promise.all([
    prisma.subject.count({ where }),
    prisma.subject.findMany({
      where,
      orderBy: [{ lessonOrder: "asc" }],
      skip: (page - 1) * PAGE,
      take: PAGE,
      select: {
        id: true,
        type: true,
        characters: true,
        primaryMeaning: true,
        readings: { where: { isPrimary: true }, take: 1, select: { reading: true } },
        progress: { where: { userId: ctx.userId }, select: { srsStage: true, suspendedAt: true } },
      },
    }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const qs = (p: number) => {
    const u = new URLSearchParams();
    if (q) u.set("q", q);
    if (type) u.set("type", type);
    if (band) u.set("band", band);
    if (stage) u.set("stage", stage);
    if (p > 1) u.set("page", String(p));
    return `/subjects${u.toString() ? `?${u}` : ""}`;
  };

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Esplora</h1>
      <Card>
        <CardContent className="pt-5">
          <form className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto_auto]" role="search">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
              <label htmlFor="q" className="sr-only">
                Cerca
              </label>
              <Input id="q" name="q" defaultValue={q} placeholder="Kanji, parola, lettura (anche romaji) o significato" className="pl-9" />
            </div>
            <NativeSelect name="type" defaultValue={type} aria-label="Tipo">
              <option value="">Tutti i tipi</option>
              <option value="radical">Radicali</option>
              <option value="kanji">Kanji</option>
              <option value="vocabulary">Vocaboli</option>
            </NativeSelect>
            <NativeSelect name="band" defaultValue={band} aria-label="Fascia JLPT">
              <option value="">Tutte le fasce</option>
              <option value="N5">N5</option>
              <option value="N4">N4</option>
              <option value="N3">N3</option>
            </NativeSelect>
            <NativeSelect name="stage" defaultValue={stage} aria-label="Stadio SRS">
              {Object.entries(STAGE_FILTERS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </NativeSelect>
            <Button type="submit">Cerca</Button>
          </form>
        </CardContent>
      </Card>

      <p className="text-sm text-muted">
        {total} risultati{pages > 1 && ` · pagina ${page} di ${pages}`}
      </p>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {rows.map((s) => {
          const p = s.progress[0];
          return (
            <li key={s.id}>
              <Link href={`/subjects/${s.id}`} className="flex h-full items-center gap-3 rounded-lg border border-border/60 bg-surface p-3 hover:border-primary/40">
                <span className={cn("kanji-display grid min-w-12 place-items-center rounded-md px-2 py-1.5 text-2xl", TYPE_STYLE[s.type as keyof typeof TYPE_STYLE])}>
                  {s.characters}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm">{s.primaryMeaning}</span>
                  {s.readings[0] && <span className="jp block truncate text-xs text-muted">{s.readings[0].reading.replace(/\./g, "")}</span>}
                  <span className={cn("block text-[11px]", p ? "text-secondary" : "text-muted/70")}>
                    {p ? (p.suspendedAt ? "Sospeso" : stageLabel(p.srsStage as SrsStage)) : "Non studiato"}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {pages > 1 && (
        <nav className="flex justify-center gap-2" aria-label="Pagine">
          {page > 1 && (
            <Button asChild variant="secondary" size="sm">
              <Link href={qs(page - 1)}>← Precedente</Link>
            </Button>
          )}
          {page < pages && (
            <Button asChild variant="secondary" size="sm">
              <Link href={qs(page + 1)}>Successiva →</Link>
            </Button>
          )}
        </nav>
      )}
    </div>
  );
}
