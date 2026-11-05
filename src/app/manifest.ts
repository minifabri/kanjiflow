import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "KanjiFlow",
    short_name: "KanjiFlow",
    description: "Studio personale dei kanji con ripetizione dilazionata, focus JLPT N3.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#101014",
    theme_color: "#101014",
    lang: "it",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Ripassi", url: "/reviews", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Lezioni", url: "/lessons", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
