// Calendar days are local 'YYYY-MM-DD' strings; they sort chronologically. Formatting is en-US.

const pad = (n) => String(n).padStart(2, '0');

export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function isYmd(s) {
  const m = typeof s === 'string' && s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]);
}

// "2023/04/15", "2023-4-5" → "2023-04-15"; anything else → "".
export function parseLooseDate(s) {
  const m = String(s ?? '').trim().match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (!m) return '';
  const out = `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  return isYmd(out) ? out : '';
}

export function formatDate(day, now = Date.now()) {
  if (!isYmd(day)) return '';
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const sameYear = y === new Date(now).getFullYear();
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

export const dayKey = (ts) => ymd(new Date(ts));

// The Monday that starts ts's week (local), stepped at noon so DST changes can't skip a day.
export function weekKey(ts) {
  const d = new Date(ts);
  const noon = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12);
  noon.setDate(noon.getDate() - ((noon.getDay() + 6) % 7));
  return ymd(noon);
}
