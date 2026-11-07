import { describe, it, expect } from 'vitest';
import { ymd, isYmd, formatDate, parseLooseDate, dayKey, weekKey } from '../../src/lib/dates.js';

describe('dates', () => {
  it('formats a local date as YYYY-MM-DD', () => {
    expect(ymd(new Date(2026, 10, 7, 23, 59))).toBe('2026-11-07');
    expect(ymd(new Date(2026, 0, 3))).toBe('2026-01-03');
  });

  it('validates YYYY-MM-DD, real calendar days only', () => {
    expect(isYmd('2026-02-28')).toBe(true);
    expect(isYmd('2026-02-30')).toBe(false);
    expect(isYmd('2026/02/28')).toBe(false);
    expect(isYmd('')).toBe(false);
  });

  it('reads Goodreads and ISO dates', () => {
    expect(parseLooseDate('2023/04/15')).toBe('2023-04-15');
    expect(parseLooseDate('2023-4-5')).toBe('2023-04-05');
    expect(parseLooseDate('')).toBe('');
    expect(parseLooseDate('not a date')).toBe('');
    expect(parseLooseDate('2023/02/31')).toBe('');
  });

  it('shows dates for people, year only when it differs', () => {
    const now = new Date(2026, 10, 7).getTime();
    expect(formatDate('2026-03-04', now)).toBe('Mar 4');
    expect(formatDate('2023-03-04', now)).toBe('Mar 4, 2023');
    expect(formatDate('', now)).toBe('');
  });

  it('groups timestamps by local day and by Monday-start week', () => {
    expect(dayKey(new Date(2026, 10, 7, 0, 30).getTime())).toBe('2026-11-07');
    // Sun Nov 8 belongs to the week starting Mon Nov 2; Mon Nov 9 starts a new one.
    expect(weekKey(new Date(2026, 10, 8, 12).getTime())).toBe('2026-11-02');
    expect(weekKey(new Date(2026, 10, 9, 12).getTime())).toBe('2026-11-09');
    // Across the DST change (Nov 1, 2026).
    expect(weekKey(new Date(2026, 10, 1, 12).getTime())).toBe('2026-10-26');
  });
});
