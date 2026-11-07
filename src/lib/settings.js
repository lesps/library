// Settings that travel with backups. `cats`: how many background cats to draw.
export const CAT_LEVELS = ['lively', 'subtle', 'off'];
export const DEFAULT_SETTINGS = { cats: 'lively', updatedAt: 0 };

export function sanitizeSettings(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  return {
    cats: CAT_LEVELS.includes(s.cats) ? s.cats : DEFAULT_SETTINGS.cats,
    updatedAt: typeof s.updatedAt === 'number' && Number.isFinite(s.updatedAt) && s.updatedAt >= 0 ? s.updatedAt : 0,
  };
}
