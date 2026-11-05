/**
 * Scarica le fonti pinnate in data/raw/ ed estrae gli zip.
 * Uso: npm run content:fetch
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadSources, RAW_DIR } from "./paths";

async function download(url: string, dest: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download fallito ${res.status}: ${url}`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  console.log(`✓ ${path.relative(process.cwd(), dest)}`);
}

async function main() {
  mkdirSync(RAW_DIR, { recursive: true });
  for (const s of loadSources()) {
    if (!s.download || !s.file) continue;
    const urls = Array.isArray(s.download) ? s.download : [s.download];
    const files = Array.isArray(s.file) ? s.file : [s.file];
    for (const [i, url] of urls.entries()) {
      const dest = path.join(RAW_DIR, files[i]!);
      if (existsSync(dest) && !process.argv.includes("--force")) {
        console.log(`= ${files[i]} già presente`);
      } else {
        await download(url, dest);
      }
      if (dest.endsWith(".zip")) {
        const outDir = dest.replace(/\.json\.zip$/, "");
        mkdirSync(outDir, { recursive: true });
        execFileSync("unzip", ["-o", "-q", dest, "-d", outDir]);
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
