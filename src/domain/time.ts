/** Date "locali" (AAAA-MM-GG) nel fuso dell'utente, usate per streak, heatmap e limiti giornalieri. */

export function localDateKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Istante UTC corrispondente alla mezzanotte locale del giorno che contiene `date`. */
export function startOfLocalDay(date: Date, timeZone: string): Date {
  const key = localDateKey(date, timeZone);
  // Cerca l'offset: confronta l'ora locale con UTC per l'istante dato.
  const guess = new Date(`${key}T00:00:00Z`);
  const offsetMs = zoneOffsetMs(guess, timeZone);
  const candidate = new Date(guess.getTime() - offsetMs);
  // Correzione per cambi d'ora a cavallo della mezzanotte.
  return localDateKey(candidate, timeZone) === key ? candidate : new Date(guess.getTime() - zoneOffsetMs(candidate, timeZone));
}

export function zoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

export function addDaysKey(key: string, days: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Serie di giorni consecutivi con attività che termina oggi (o ieri, se oggi non si è ancora studiato). */
export function currentStreak(activeDays: ReadonlySet<string>, todayKey: string): number {
  let day = activeDays.has(todayKey) ? todayKey : addDaysKey(todayKey, -1);
  let streak = 0;
  while (activeDays.has(day)) {
    streak++;
    day = addDaysKey(day, -1);
  }
  return streak;
}

export function longestStreak(activeDays: ReadonlySet<string>): number {
  let best = 0;
  for (const d of activeDays) {
    if (activeDays.has(addDaysKey(d, -1))) continue;
    let len = 1;
    let cur = d;
    while (activeDays.has((cur = addDaysKey(cur, 1)))) len++;
    best = Math.max(best, len);
  }
  return best;
}
