import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Statistiche" };

export default function Page() {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="text-2xl font-semibold">Statistiche</h1>
      <Card>
        <CardHeader>
          <CardTitle>In arrivo</CardTitle>
          <CardDescription>Grafici di accuratezza, tempi di risposta, letture più confuse e carico previsto, calcolati dallo storico dei ripassi: arrivano nella prossima milestone. Lo storico viene già registrato da ora.</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
