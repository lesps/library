import { describe, it, expect } from 'vitest';
import { catSvg, randomCat, rng, scatter, POSES, COATS, ACCESSORIES, EYES } from '../../src/lib/cats.js';

describe('rng', () => {
  it('is deterministic per seed and stays in [0, 1)', () => {
    const a = rng(42);
    const b = rng(42);
    const xs = Array.from({ length: 200 }, () => a());
    expect(xs).toEqual(Array.from({ length: 200 }, () => b()));
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(rng(43)()).not.toBe(rng(42)());
  });
});

describe('catSvg', () => {
  const all = POSES.flatMap((pose) => Object.keys(COATS).flatMap((coat) =>
    ACCESSORIES.map((accessory) => ({ pose, coat, accessory, eyes: 'open', id: `c-${pose}-${coat}-${accessory}` }))));

  it('renders every pose × coat × accessory as clean SVG markup', () => {
    for (const opts of all) {
      const svg = catSvg(opts);
      expect(svg, JSON.stringify(opts)).toMatch(/^<svg [^>]*viewBox="0 0 120 120"[^>]*>[\s\S]*<\/svg>$/);
      expect(svg).not.toMatch(/undefined|NaN|null/);
    }
  });

  it('never repeats an attribute within a tag (strict SVG parsers reject that)', () => {
    for (const opts of all) {
      for (const [tag] of catSvg(opts).matchAll(/<[a-zA-Z][^>]*>/g)) {
        const names = [...tag.matchAll(/\s([a-zA-Z-:]+)=/g)].map((m) => m[1]);
        expect(new Set(names).size, `${opts.pose}/${opts.coat}: ${tag}`).toBe(names.length);
      }
    }
  });

  it('renders every eye style', () => {
    for (const eyes of EYES) expect(catSvg({ pose: 'sit', coat: 'ginger', eyes, id: 'e' })).not.toMatch(/undefined|NaN/);
  });

  it('prefixes every id with the cat id, so many cats can share a page', () => {
    const svg = catSvg({ pose: 'sit', coat: 'calico', id: 'zz9' });
    const ids = [...svg.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(id.startsWith('zz9-')).toBe(true);
    for (const [, ref] of svg.matchAll(/url\(#([^)]+)\)/g)) expect(ids).toContain(ref);
  });

  it('is decorative: hidden from screen readers', () => {
    expect(catSvg({ pose: 'loaf', coat: 'gray', id: 'a' })).toContain('aria-hidden="true"');
  });

  it('can peek over the page edge itself, without its book', () => {
    expect(catSvg({ pose: 'peek', coat: 'gray', id: 'p' })).toContain('<rect');
    expect(catSvg({ pose: 'peek', coat: 'gray', id: 'p', ledge: false })).not.toContain('<rect');
  });

  it('draws glasses only when asked', () => {
    expect(catSvg({ pose: 'sit', coat: 'ginger', accessory: 'glasses', id: 'g' })).toContain('class="glasses"');
    expect(catSvg({ pose: 'sit', coat: 'ginger', accessory: 'none', id: 'g' })).not.toContain('class="glasses"');
  });
});

describe('randomCat', () => {
  it('only picks known parts, and the same seed gives the same cat', () => {
    for (let s = 0; s < 300; s++) {
      const c = randomCat(rng(s));
      expect(POSES).toContain(c.pose);
      expect(Object.keys(COATS)).toContain(c.coat);
      expect(ACCESSORIES).toContain(c.accessory);
      expect(EYES).toContain(c.eyes);
      expect(randomCat(rng(s))).toEqual(c);
    }
  });

  it('closes the eyes of sleeping cats', () => {
    for (let s = 0; s < 300; s++) {
      const c = randomCat(rng(s));
      if (c.pose === 'sleep') expect(c.eyes).toBe('closed');
    }
  });

  it('uses every pose and coat over enough draws', () => {
    const r = rng(7);
    const cats = Array.from({ length: 600 }, () => randomCat(r));
    expect(new Set(cats.map((c) => c.pose))).toEqual(new Set(POSES));
    expect(new Set(cats.map((c) => c.coat))).toEqual(new Set(Object.keys(COATS)));
  });
});

describe('scatter', () => {
  it('places cats inside the area without overlapping', () => {
    for (let s = 0; s < 50; s++) {
      const spots = scatter(rng(s), { width: 390, height: 844, count: 5, min: 70, max: 110 });
      expect(spots.length).toBeGreaterThan(0);
      expect(spots.length).toBeLessThanOrEqual(5);
      for (const p of spots) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.x + p.size).toBeLessThanOrEqual(390);
        expect(p.y + p.size).toBeLessThanOrEqual(844);
      }
      for (let i = 0; i < spots.length; i++) {
        for (let j = i + 1; j < spots.length; j++) {
          const a = spots[i];
          const b = spots[j];
          const apart = a.x + a.size <= b.x || b.x + b.size <= a.x || a.y + a.size <= b.y || b.y + b.size <= a.y;
          expect(apart).toBe(true);
        }
      }
    }
  });

  it('copes with an area too small for any cat', () => {
    expect(scatter(rng(1), { width: 40, height: 40, count: 3, min: 70, max: 110 })).toEqual([]);
  });
});
