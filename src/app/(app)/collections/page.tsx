import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Raccolte" };

export default function Page() {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="text-2xl font-semibold">Raccolte</h1>
      <Card>
        <CardHeader>
          <CardTitle>In arrivo</CardTitle>
          <CardDescription>Raccolte personalizzate per il percorso Custom e importazione di liste di vocaboli: arrivano nella prossima milestone.</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
