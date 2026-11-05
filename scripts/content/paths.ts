import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export const ROOT = path.resolve(__dirname, "../..");
export const DATA_DIR = path.join(ROOT, "data");
export const RAW_DIR = path.join(DATA_DIR, "raw");
export const CURATED_DIR = path.join(DATA_DIR, "curated");
export const BUILD_DIR = path.join(DATA_DIR, "build");

export interface SourceDef {
  key: string;
  name: string;
  url: string | null;
  license: string;
  attribution: string;
  version: string;
  download?: string | string[];
  file?: string | string[];
}

export function loadSources(): SourceDef[] {
  return (JSON.parse(readFileSync(path.join(DATA_DIR, "sources.json"), "utf8")) as { sources: SourceDef[] }).sources;
}

/** Primo file .json dentro una cartella estratta da uno zip. */
export function rawJson<T>(dirName: string): T {
  const dir = path.join(RAW_DIR, dirName);
  const file = readdirSync(dir).find((f) => f.endsWith(".json"));
  if (!file) throw new Error(`Nessun JSON in ${dir}: eseguire npm run content:fetch`);
  return JSON.parse(readFileSync(path.join(dir, file), "utf8")) as T;
}

export function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, "utf8")) as T;
}
