import { addDaysKey } from "@/domain/time";

/** Calendario attività: 26 settimane, una colonna per settimana (lun → dom). */
export function Heatmap({ data, todayKey }: { data: { date: string; count: number }[]; todayKey: string }) {
  const counts = new Map(data.map((d) => [d.date, d.count]));
  const weeks = 26;
  const todayDow = (new Date(`${todayKey}T12:00:00Z`).getUTCDay() + 6) % 7; // 0 = lunedì
  const start = addDaysKey(todayKey, -(weeks - 1) * 7 - todayDow);
  const max = Math.max(1, ...data.map((d) => d.count));
  const level = (c: number) => (c === 0 ? 0 : Math.min(4, Math.ceil((c / max) * 4)));
  const shades = ["var(--color-elevated)", "color-mix(in oklab, var(--color-primary) 30%, transparent)", "color-mix(in oklab, var(--color-primary) 55%, transparent)", "color-mix(in oklab, var(--color-primary) 80%, transparent)", "var(--color-primary)"];
  const cell = 11;
  const gap = 3;
  const activeDays = data.filter((d) => d.count > 0).length;
  return (
    <div className="overflow-x-auto">
      <svg
        width={weeks * (cell + gap)}
        height={7 * (cell + gap)}
        role="img"
        aria-label={`Attività degli ultimi sei mesi: ${activeDays} giorni di studio`}
        className="block"
      >
        {Array.from({ length: weeks }, (_, w) =>
          Array.from({ length: 7 }, (_, d) => {
            const key = addDaysKey(start, w * 7 + d);
            if (key > todayKey) return null;
            const c = counts.get(key) ?? 0;
            return (
              <rect key={key} x={w * (cell + gap)} y={d * (cell + gap)} width={cell} height={cell} rx={2.5} fill={shades[level(c)]}>
                <title>{`${key}: ${c} attività`}</title>
              </rect>
            );
          }),
        )}
      </svg>
    </div>
  );
}
