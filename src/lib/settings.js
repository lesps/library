// Settings that travel with backups. `cats`: how many background cats to draw. `goals`: reading
// goals by year, { "2026": { books: 40, pages: 12000 } }; either number may be null.
export const CAT_LEVELS = ['lively', 'subtle', 'off'];
export const DEFAULT_SETTINGS = { cats: 'lively', goals: {}, updatedAt: 0 };

const count = (max) => (v) => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return Number.isInteger(n) && n >= 1 && n <= max ? n : null;
};
const goalBooks = count(100_000);
const goalPages = count(100_000_000);

export function sanitizeGoals(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [year, g] of Object.entries(raw)) {
    if (!/^\d{4}$/.test(year) || !g || typeof g !== 'object') continue;
    const books = goalBooks(g.books);
    const pages = goalPages(g.pages);
    if (books != null || pages != null) out[year] = { books, pages };
  }
  return out;
}

export function sanitizeSettings(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  return {
    cats: CAT_LEVELS.includes(s.cats) ? s.cats : DEFAULT_SETTINGS.cats,
    goals: sanitizeGoals(s.goals),
    updatedAt: typeof s.updatedAt === 'number' && Number.isFinite(s.updatedAt) && s.updatedAt >= 0 ? s.updatedAt : 0,
  };
}
