/** Distanza di Damerau-Levenshtein (trasposizioni adiacenti), con soglia per uscita anticipata. */
export function editDistance(a: string, b: string, max = Infinity): number {
  if (a === b) return 0;
  const A = [...a];
  const B = [...b];
  if (Math.abs(A.length - B.length) > max) return max + 1;
  const rows = A.length + 1;
  const cols = B.length + 1;
  const d: number[][] = Array.from({ length: rows }, (_, i) => {
    const r = new Array<number>(cols).fill(0);
    r[0] = i;
    return r;
  });
  for (let j = 0; j < cols; j++) d[0]![j] = j;
  for (let i = 1; i < rows; i++) {
    let rowMin = Infinity;
    for (let j = 1; j < cols; j++) {
      const cost = A[i - 1] === B[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && A[i - 1] === B[j - 2] && A[i - 2] === B[j - 1]) {
        v = Math.min(v, d[i - 2]![j - 2]! + 1);
      }
      d[i]![j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
  }
  return d[rows - 1]![cols - 1]!;
}

// Tastiera QWERTY (layout italiano: stesse lettere). Vicine = adiacenti in orizzontale o in diagonale.
const ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
const NEIGHBORS = new Map<string, Set<string>>();
for (let r = 0; r < ROWS.length; r++) {
  for (let c = 0; c < ROWS[r]!.length; c++) {
    const ch = ROWS[r]![c]!;
    const set = new Set<string>();
    for (const [dr, dcs] of [
      [0, [-1, 1]],
      [-1, [0, 1]],
      [1, [-1, 0]],
    ] as const) {
      const row = ROWS[r + dr];
      if (!row) continue;
      for (const dc of dcs) {
        const n = row[c + dc];
        if (n) set.add(n);
      }
    }
    NEIGHBORS.set(ch, set);
  }
}
const near = (a: string, b: string) => NEIGHBORS.get(a)?.has(b) ?? false;

/**
 * Vero se `typed` differisce da `target` per un solo "errore di dita" tipico:
 * lettera vicina sulla tastiera, due lettere adiacenti scambiate, lettera doppia in più o in meno,
 * lettera in più vicina a quella accanto. Errori di questo tipo raramente producono un'altra parola voluta.
 */
export function isKeyboardSlip(typed: string, target: string): boolean {
  const a = [...typed];
  const b = [...target];
  if (a.join("") === b.join("")) return false;
  if (a.length === b.length) {
    const diff = a.map((ch, i) => (ch !== b[i] ? i : -1)).filter((i) => i >= 0);
    if (diff.length === 1) return near(a[diff[0]!]!, b[diff[0]!]!);
    if (diff.length === 2 && diff[1] === diff[0]! + 1) return a[diff[0]!] === b[diff[1]!] && a[diff[1]!] === b[diff[0]!];
    return false;
  }
  // Una lettera in più (typed) o in meno: si riconduce al caso "in più" scambiando i ruoli.
  const [long, short] = a.length === b.length + 1 ? [a, b] : b.length === a.length + 1 ? [b, a] : [null, null];
  if (!long || !short) return false;
  for (let i = 0; i < long.length; i++) {
    if ([...long.slice(0, i), ...long.slice(i + 1)].join("") !== short.join("")) continue;
    const extra = long[i]!;
    const prev = long[i - 1];
    const next = long[i + 1];
    if (extra === prev || extra === next) return true; // doppia in più / in meno
    if ((prev && near(extra, prev)) || (next && near(extra, next))) return true; // tasto vicino premuto insieme
  }
  return false;
}
