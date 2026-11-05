"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface Bucket {
  label: string;
  count: number;
}

export function ForecastChart({ hourly, daily }: { hourly: Bucket[]; daily: Bucket[] }) {
  const [view, setView] = useState<"hourly" | "daily">("hourly");
  const data = view === "hourly" ? hourly : daily;
  const max = Math.max(1, ...data.map((d) => d.count));
  const total = data.reduce((a, b) => a + b.count, 0);
  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-xs text-muted">
          {total === 0 ? "Nessun ripasso in arrivo" : `${total} ripassi ${view === "hourly" ? "nelle prossime 24 ore" : "nei prossimi 7 giorni"}`}
        </p>
        <div role="tablist" aria-label="Vista previsione" className="flex rounded-md bg-elevated p-0.5 text-xs">
          {(["hourly", "daily"] as const).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={cn("rounded px-2.5 py-1 text-muted", view === v && "bg-surface text-foreground")}
            >
              {v === "hourly" ? "24 ore" : "7 giorni"}
            </button>
          ))}
        </div>
      </div>
      <div className="flex h-32 items-end gap-[3px]" role="img" aria-label={`Previsione ripassi: ${data.map((d) => `${d.label} ${d.count}`).join(", ")}`}>
        {data.map((d, i) => (
          <div key={i} className="group relative flex h-full flex-1 flex-col justify-end">
            <div
              className={cn("w-full rounded-t-sm", d.count > 0 ? "bg-primary/80 group-hover:bg-primary" : "bg-elevated")}
              style={{ height: d.count > 0 ? `${Math.max(6, (d.count / max) * 100)}%` : "3px" }}
            />
            {d.count > 0 && (
              <span className="pointer-events-none absolute -top-6 left-1/2 hidden -translate-x-1/2 rounded bg-elevated px-1.5 py-0.5 text-[10px] text-foreground group-hover:block">
                {d.count}
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-[3px] text-[10px] text-muted" aria-hidden>
        {data.map((d, i) => (
          <span key={i} className="flex-1 truncate text-center">
            {view === "hourly" ? (i % 4 === 0 ? d.label : "") : d.label}
          </span>
        ))}
      </div>
    </div>
  );
}
