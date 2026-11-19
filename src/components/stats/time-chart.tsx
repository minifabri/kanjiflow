"use client";

/**
 * Grafico a una serie nel tempo, a barre o a linea. Un solo colore (--color-chart), griglia a filo,
 * barre sottili con l'estremità arrotondata e 2px di spazio tra l'una e l'altra.
 * Tooltip al passaggio del mouse o con le frecce da tastiera; i dati restano leggibili in una tabella.
 */
import { useId, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

export interface ChartPoint {
  key: string;
  /** Etichetta completa (tooltip e tabella), es. "mar 18 nov". */
  label: string;
  /** Etichetta breve sull'asse, es. "18". */
  short: string;
  /** null = nessun dato (la linea si interrompe, la barra non c'è). */
  value: number | null;
  /** Righe del tooltip e colonne della tabella. */
  details: { label: string; value: string }[];
}

/** Massimo "tondo" per l'asse: 1, 2, 2,5 o 5 per una potenza di dieci, almeno 4. */
export function niceMax(max: number): number {
  if (max <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(max));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * pow >= max) return m * pow;
  return 10 * pow;
}

export function TimeChart({
  points,
  kind,
  max,
  tickSuffix = "",
  ariaLabel,
  height = 160,
}: {
  points: ChartPoint[];
  kind: "bar" | "line";
  /** Massimo dell'asse; se assente si arrotonda il valore più alto. */
  max?: number;
  /** Suffisso dei valori sull'asse, es. "%". Testo e non funzione: il grafico riceve le props da un componente server. */
  tickSuffix?: string;
  ariaLabel: string;
  height?: number;
}) {
  const [active, setActive] = useState<number | null>(null);
  const liveId = useId();
  const n = points.length;
  const top = max ?? niceMax(Math.max(0, ...points.map((p) => p.value ?? 0)));
  const ticks = [0, top / 2, top];
  const x = (i: number) => ((i + 0.5) / n) * 100;
  const y = (v: number) => (Math.min(v, top) / top) * 100;
  const labelEvery = Math.max(1, Math.ceil(n / 7));

  const path = (() => {
    let d = "";
    let open = false;
    points.forEach((p, i) => {
      if (p.value === null) {
        open = false;
        return;
      }
      d += `${open ? "L" : "M"}${x(i).toFixed(2)} ${(100 - y(p.value)).toFixed(2)} `;
      open = true;
    });
    return d.trim();
  })();

  function onKey(e: KeyboardEvent) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    setActive((cur) => {
      const from = cur ?? n - 1;
      if (e.key === "Home") return 0;
      if (e.key === "End") return n - 1;
      return Math.max(0, Math.min(n - 1, from + (e.key === "ArrowLeft" ? -1 : 1)));
    });
  }

  const tip = active !== null ? points[active] : null;
  const tipAlign = active === null ? "" : active < n * 0.2 ? "translate-x-0" : active > n * 0.8 ? "-translate-x-full" : "-translate-x-1/2";

  return (
    <figure>
      <div className="relative" style={{ height: height + 22 }}>
        <div className="absolute inset-x-0 top-0 flex" style={{ height }}>
          <div className="relative w-9 shrink-0 text-[10px] tabular-nums text-muted" aria-hidden>
            {ticks.map((t) => (
              <span key={t} className="absolute right-2 translate-y-1/2" style={{ bottom: `${y(t)}%` }}>
                {Math.round(t).toLocaleString("it-IT")}
                {tickSuffix}
              </span>
            ))}
          </div>
          <div
            className="relative flex-1 rounded-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            tabIndex={0}
            role="img"
            aria-label={`${ariaLabel}. Usa le frecce per leggere i valori.`}
            aria-describedby={liveId}
            onKeyDown={onKey}
            onFocus={() => setActive((cur) => cur ?? n - 1)}
            onBlur={() => setActive(null)}
            onMouseLeave={() => setActive(null)}
          >
            {ticks.map((t) => (
              <div key={t} className="absolute inset-x-0 h-px bg-border" style={{ bottom: `${y(t)}%` }} aria-hidden />
            ))}

            {kind === "bar" ? (
              <div className="absolute inset-0 flex items-end gap-[2px]" aria-hidden>
                {points.map((p, i) => (
                  <div key={p.key} className="flex h-full min-w-0 flex-1 items-end" onMouseEnter={() => setActive(i)}>
                    <div
                      className={cn("w-full rounded-t-[4px] bg-chart transition-opacity", active !== null && active !== i && "opacity-45")}
                      style={{ height: p.value ? `max(2px, ${y(p.value)}%)` : 0 }}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="absolute inset-0" aria-hidden>
                {active !== null && <div className="absolute inset-y-0 w-px bg-muted/50" style={{ left: `${x(active)}%` }} />}
                <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
                  <path d={path} fill="none" stroke="var(--color-chart)" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
                </svg>
                {points.map((p, i) => {
                  if (p.value === null) return null;
                  // Pallino solo dove serve: sul punto evidenziato e sui giorni isolati, che senza non si vedrebbero.
                  // Sugli altri coprirebbe i segmenti corti tra giorni vicini.
                  const isolated = (points[i - 1]?.value ?? null) === null && (points[i + 1]?.value ?? null) === null;
                  if (!isolated && active !== i) return null;
                  return (
                    <span
                      key={p.key}
                      className={cn("absolute size-2 -translate-x-1/2 translate-y-1/2 rounded-full bg-chart", active === i && "size-2.5 ring-2 ring-surface")}
                      style={{ left: `${x(i)}%`, bottom: `${y(p.value)}%` }}
                    />
                  );
                })}
                <div className="absolute inset-0 flex">
                  {points.map((p, i) => (
                    <div key={p.key} className="h-full flex-1" onMouseEnter={() => setActive(i)} />
                  ))}
                </div>
              </div>
            )}

            {tip && (
              <div
                className={cn("pointer-events-none absolute -top-2 z-10 min-w-36 -translate-y-full rounded-md border border-border bg-elevated px-3 py-2 text-xs shadow-lg", tipAlign)}
                style={{ left: `${x(active!)}%` }}
                aria-hidden
              >
                <p className="font-medium">{tip.label}</p>
                {tip.details.map((d) => (
                  <p key={d.label} className="mt-0.5 flex justify-between gap-4 text-muted">
                    <span>{d.label}</span>
                    <span className="tabular-nums text-foreground">{d.value}</span>
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 flex pl-9 text-[10px] text-muted" aria-hidden>
          {points.map((p, i) => (
            <span key={p.key} className="min-w-0 flex-1 overflow-visible whitespace-nowrap text-center">
              {(n - 1 - i) % labelEvery === 0 ? p.short : ""}
            </span>
          ))}
        </div>
      </div>
      <p id={liveId} className="sr-only" aria-live="polite">
        {tip ? `${tip.label}: ${tip.details.map((d) => `${d.label} ${d.value}`).join(", ")}` : ""}
      </p>
      <details className="mt-3 text-xs">
        <summary className="cursor-pointer text-muted hover:text-foreground">Mostra i dati come tabella</summary>
        <div className="mt-2 max-h-64 overflow-auto">
          <table className="w-full text-left tabular-nums">
            <thead className="text-muted">
              <tr>
                <th className="py-1 pr-3 font-normal">Periodo</th>
                {points[0]?.details.map((d) => (
                  <th key={d.label} className="py-1 pr-3 font-normal">
                    {d.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.key} className="border-t border-border/60">
                  <td className="py-1 pr-3">{p.label}</td>
                  {p.details.map((d) => (
                    <td key={d.label} className="py-1 pr-3">
                      {d.value}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
