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
