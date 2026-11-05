import { Logo } from "@/components/logo";

export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <main className="grid min-h-dvh place-items-center px-4 text-center">
      <div className="max-w-sm">
        <Logo className="mx-auto size-11" />
        <h1 className="mt-5 text-xl font-semibold">Sei offline</h1>
        <p className="mt-2 text-sm text-muted">
          Lezioni e ripassi richiedono la connessione: ogni risposta viene salvata subito sul server, così non si perde e non si duplica. Riprova
          quando la rete torna disponibile.
        </p>
      </div>
    </main>
  );
}
