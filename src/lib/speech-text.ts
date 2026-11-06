/** Letture KANJIDIC "か.つ" / "-が.ち" → testo pronunciabile "かつ" / "がち". Modulo puro: usabile da server e client. */
export function speakableReading(reading: string) {
  return reading.replace(/[.\-]/g, "");
}
