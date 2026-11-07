import { describe, it, expect } from 'vitest';
import { parseChangelog, compareVersions, notesSince } from '../../src/lib/changelog.js';
import CHANGELOG from '../../CHANGELOG.md?raw';
import { version } from '../../package.json';

const sample = `# Changelog

## 1.2.0 — 2026-11-04

- **Look up** tab: search \`foods\`, see [the docs](https://example.com).
- A bullet that
  wraps onto a second line.

### Developer

- \`npm run foods\` regenerates the list.

## 1.1.0 — 2026-11-03

More bananas.

- Quick buttons.

## 1.0.0 — 2026-11-02

- First.
`;

describe('parseChangelog', () => {
  it('reads each release with its bullets as plain text, skipping developer notes', () => {
    expect(parseChangelog(sample)).toEqual([
      { version: '1.2.0', date: '2026-11-04', intro: '', items: ['Look up tab: search foods, see the docs.', 'A bullet that wraps onto a second line.'] },
      { version: '1.1.0', date: '2026-11-03', intro: 'More bananas.', items: ['Quick buttons.'] },
      { version: '1.0.0', date: '2026-11-02', intro: '', items: ['First.'] },
    ]);
  });

  it('copes with nothing', () => expect(parseChangelog('')).toEqual([]));
});

describe('compareVersions', () => {
  it.each([
    ['1.2.0', '1.10.0', -1],
    ['1.10.0', '1.2.0', 1],
    ['2.0.0', '2.0.0', 0],
    ['1.2', '1.2.0', 0],
  ])('%s vs %s → %i', (a, b, n) => expect(Math.sign(compareVersions(a, b))).toBe(n));
});

describe('notesSince', () => {
  const releases = parseChangelog(sample);
  const versions = (seen, current, max) => notesSince(releases, seen, current, max).map((r) => r.version);

  it('lists the releases after the one last seen, newest first', () => {
    expect(versions('1.0.0', '1.2.0')).toEqual(['1.2.0', '1.1.0']);
    expect(versions('1.1.0', '1.2.0')).toEqual(['1.2.0']);
  });

  it('stops at the running version and caps the list', () => {
    expect(versions('1.0.0', '1.1.0')).toEqual(['1.1.0']);
    expect(versions('0.1.0', '1.2.0', 2)).toEqual(['1.2.0', '1.1.0']);
  });

  it('backfills everything up to the running version when nothing was seen before', () => {
    expect(versions(null, '1.2.0')).toEqual(['1.2.0', '1.1.0', '1.0.0']);
    expect(versions(null, '1.1.0')).toEqual(['1.1.0', '1.0.0']);
  });
});

describe('the real CHANGELOG.md', () => {
  it('has user-facing notes for the version in package.json', () => {
    const current = parseChangelog(CHANGELOG).find((r) => r.version === version);
    expect(current, `CHANGELOG.md needs a "## ${version} — date" section`).toBeDefined();
    expect(current.items.length).toBeGreaterThan(0);
    for (const item of current.items) expect(item).not.toMatch(/npm run|src\//);
  });

  it('lists releases newest first', () => {
    const vs = parseChangelog(CHANGELOG).map((r) => r.version);
    expect([...vs].sort((a, b) => compareVersions(b, a))).toEqual(vs);
  });
});
