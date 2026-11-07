// Fractional ranks: strings that sort in list order, so moving one item writes only that item.
// Base-36 digits; a rank never ends in '0', which guarantees there's always room between two ranks.
// '' as a bound means the open end of the list.

const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz';
const B = DIGITS.length;

function midpoint(a, b) {
  if (b != null) {
    let n = 0;
    while ((a[n] ?? '0') === b[n]) n++;
    if (n > 0) return b.slice(0, n) + midpoint(a.slice(n), b.slice(n));
  }
  const da = a ? DIGITS.indexOf(a[0]) : 0;
  const db = b != null ? DIGITS.indexOf(b[0]) : B;
  if (db - da > 1) return DIGITS[Math.round((da + db) / 2)];
  if (b && b.length > 1) return b.slice(0, 1);
  return DIGITS[da] + midpoint(a.slice(1), null);
}

export function rankBetween(a = '', b = '') {
  if (a && b && a >= b) throw new Error(`rankBetween: ${a} is not before ${b}`);
  return midpoint(a, b || null);
}

// n evenly spaced ranks between lo and hi (exclusive), for placing a batch at once.
export function spreadRanks(n, lo = '', hi = '') {
  if (n <= 0) return [];
  if (lo || hi) {
    const out = [];
    // Bisect recursively so the batch stays balanced instead of growing one digit per item.
    const fill = (from, to, count) => {
      if (count <= 0) return;
      const mid = rankBetween(from, to);
      const left = Math.floor((count - 1) / 2);
      fill(from, mid, left);
      out.push(mid);
      fill(mid, to, count - 1 - left);
    };
    fill(lo, hi, n);
    return out;
  }
  let width = 1;
  while (B ** width < (n + 1) * B) width++;
  const step = Math.floor(B ** width / (n + 1));
  return Array.from({ length: n }, (_, i) => {
    const s = ((i + 1) * step).toString(B).padStart(width, '0');
    return s.endsWith('0') ? `${s.slice(0, -1)}1` : s;
  });
}
