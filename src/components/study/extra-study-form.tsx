import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label, NativeSelect } from "@/components/ui/misc";
import { startExtraStudyAction } from "@/app/(app)/reviews/actions";

export function ExtraStudyForm({ empty }: { empty?: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Ripasso su richiesta</CardTitle>
        <CardDescription>Ripassa materiale già noto (es. kanji N5/N4) senza modificare gli stadi SRS. Le risposte restano nello storico.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={startExtraStudyAction} className="grid gap-4 sm:grid-cols-4 sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="band">Fascia</Label>
            <NativeSelect id="band" name="band" defaultValue="N4">
              <option value="">Tutte</option>
              <option value="N5">N5</option>
              <option value="N4">N4</option>
              <option value="N3">N3</option>
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="type">Tipo</Label>
            <NativeSelect id="type" name="type" defaultValue="kanji">
              <option value="">Tutti</option>
              <option value="kanji">Kanji</option>
              <option value="vocabulary">Vocaboli</option>
              <option value="radical">Radicali</option>
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="count">Quanti</Label>
            <NativeSelect id="count" name="count" defaultValue="20">
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="40">40</option>
            </NativeSelect>
          </div>
          <Button type="submit">Inizia</Button>
          <label className="flex items-center gap-2 text-sm text-muted sm:col-span-4">
            <input type="checkbox" name="burnedOnly" className="accent-[var(--color-primary)]" /> Solo elementi bruciati
          </label>
        </form>
        {empty && <p className="mt-3 text-sm text-gold">Nessun elemento corrisponde ai filtri: prova un&apos;altra fascia o tipo.</p>}
      </CardContent>
    </Card>
  );
}
