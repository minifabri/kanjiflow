import type { Metadata, Viewport } from "next";
import "./globals.css";
import { prisma } from "@/server/db";
import { ServiceWorkerRegister } from "@/components/sw-register";

// Dati personali e sempre aggiornati: nessuna pagina viene prerenderizzata con dati congelati.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "KanjiFlow", template: "%s · KanjiFlow" },
  description: "Studio personale dei kanji con ripetizione dilazionata, focus JLPT N3.",
  applicationName: "KanjiFlow",
  appleWebApp: { capable: true, title: "KanjiFlow", statusBarStyle: "black-translucent" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#101014",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

async function getTheme(): Promise<"dark" | "light" | "system"> {
  try {
    const s = await prisma.userSettings.findFirst({ select: { theme: true } });
    return (s?.theme as "dark" | "light" | "system") ?? "dark";
  } catch {
    return "dark";
  }
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const theme = await getTheme();
  return (
    <html lang="it" data-theme={theme === "system" ? "dark" : theme} suppressHydrationWarning>
      <head>
        {theme === "system" && (
          <script
            // Applica il tema di sistema prima del primo paint (nessun flash).
            dangerouslySetInnerHTML={{
              __html: `try{document.documentElement.dataset.theme=matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'}catch(e){}`,
            }}
          />
        )}
      </head>
      <body className="min-h-dvh antialiased">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
