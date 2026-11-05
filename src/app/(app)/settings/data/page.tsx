import { prisma } from "@/server/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Dati e fonti" };

export default async function DataPage() {
  const sources = await prisma.contentSource.findMany({ orderBy: { name: "asc" } });
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="text-2xl font-semibold">Dati e fonti</h1>
      <Card>
        <CardHeader>
          <CardTitle>Backup, importazione ed esportazione</CardTitle>
          <CardDescription>
            Esportazione JSON/CSV, backup e ripristino e importazione di liste personali arrivano nella prossima milestone. I dati sono già tutti
            nel database e legati al tuo utente.
          </CardDescription>
        </CardHeader>
      </Card>
      <Card id="fonti">
        <CardHeader>
          <CardTitle>Fonti e licenze</CardTitle>
          <CardDescription>
            KanjiFlow usa dati liberamente licenziati. I significati italiani sono generati e marcati come tali; le traduzioni delle frasi d&apos;esempio
            sono quelle inglesi originali di Tatoeba.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-4">
            {sources.map((s) => (
              <li key={s.id} className="border-b border-border/60 pb-4 last:border-0 last:pb-0">
                <p className="text-sm font-medium">
                  {s.url ? (
                    <a href={s.url} className="hover:underline" target="_blank" rel="noreferrer">
                      {s.name}
                    </a>
                  ) : (
                    s.name
                  )}
                </p>
                <p className="mt-0.5 text-xs text-secondary">
                  {s.license} · versione {s.version}
                </p>
                <p className="mt-1 text-xs text-muted">{s.attribution}</p>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
