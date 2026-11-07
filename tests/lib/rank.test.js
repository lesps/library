import { describe, it, expect } from 'vitest';
import { rankBetween, spreadRanks } from '../../src/lib/rank.js';

describe('rankBetween', () => {
  it('starts in the middle of an empty list', () => {
    expect(rankBetween('', '')).toBe('i');
  });

  it('always lands strictly between its neighbours', () => {
    const cases = [['', 'i'], ['i', ''], ['a', 'b'], ['a', 'a1'], ['az', 'b'], ['zz', ''], ['', '01'], ['a0001', 'a0002']];
    for (const [a, b] of cases) {
      const r = rankBetween(a, b);
      if (a) expect(r > a, `${a} < ${r}`).toBe(true);
      if (b) expect(r < b, `${r} < ${b}`).toBe(true);
      expect(r.endsWith('0')).toBe(false);
    }
  });

  it('keeps working through many inserts at the same spot', () => {
    let lo = 'a';
    const hi = 'b';
    for (let i = 0; i < 200; i++) {
      const r = rankBetween(lo, hi);
      expect(r > lo && r < hi).toBe(true);
      lo = r;
    }
  });

  it('stays short when appending one at a time', () => {
    let last = '';
    for (let i = 0; i < 300; i++) last = rankBetween(last, '');
    expect(last.length).toBeLessThan(70);
  });

  it('rejects out-of-order neighbours', () => {
    expect(() => rankBetween('b', 'a')).toThrow();
  });
});

describe('spreadRanks', () => {
  it('gives n strictly increasing, short ranks with room between them', () => {
    for (const n of [0, 1, 2, 35, 36, 1000, 5000]) {
      const rs = spreadRanks(n);
      expect(rs).toHaveLength(n);
      for (let i = 1; i < n; i++) expect(rs[i] > rs[i - 1]).toBe(true);
      for (const r of rs) expect(r.endsWith('0')).toBe(false);
      if (n > 1) expect(rankBetween(rs[0], rs[1]) < rs[1]).toBe(true);
    }
    expect(spreadRanks(5000)[0].length).toBeLessThanOrEqual(4);
  });

  it('fits between two existing ranks when given bounds', () => {
    const rs = spreadRanks(10, 'c', 'd');
    expect(rs.every((r) => r > 'c' && r < 'd')).toBe(true);
    for (let i = 1; i < rs.length; i++) expect(rs[i] > rs[i - 1]).toBe(true);
  });
});
