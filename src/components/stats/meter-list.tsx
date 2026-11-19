/** Elenco di rapporti, uno per riga: nome, barra sulla stessa traccia e cifra. Le barre sono allineate. */
export interface MeterRow {
  key: string;
  label: string;
  /** Rapporto tra 0 e 1; null = nessun dato. */
  ratio: number | null;
  figure: string;
  hint?: string;
}

export function MeterList({ rows, ariaLabel }: { rows: MeterRow[]; ariaLabel: string }) {
  return (
    <ul className="space-y-3" aria-label={ariaLabel}>
      {rows.map((r) => (
        <li key={r.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 sm:grid-cols-[11rem_minmax(0,1fr)_7.5rem]">
          <span className="truncate text-sm">{r.label}</span>
          <span className="order-last col-span-2 h-2 overflow-hidden rounded-full bg-elevated sm:order-none sm:col-span-1" aria-hidden>
            {r.ratio !== null && <span className="block h-full rounded-full bg-chart" style={{ width: `${Math.max(0, Math.min(1, r.ratio)) * 100}%` }} />}
          </span>
          <span className="text-right text-sm tabular-nums">
            {r.figure}
            {r.hint && <span className="block text-[11px] text-muted">{r.hint}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}
