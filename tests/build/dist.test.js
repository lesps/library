import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { SPLASH_DEVICES } from '../../scripts/splash.js';

const dist = new URL('../../dist/', import.meta.url).pathname;
const base = process.env.BASE_PATH || '/';
const read = (f) => readFileSync(join(dist, f), 'utf8');
const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
const mainJs = () => walk(join(dist, 'assets')).find((f) => /index-[\w-]+\.js$/.test(f));

describe('dist/', () => {
  it('exists (run `npm run build` first)', () => expect(existsSync(join(dist, 'index.html'))).toBe(true));

  it('is small: under 600 KB in total (launch screens aside)', () => {
    const bytes = walk(dist).filter((f) => !f.includes('/splash/')).reduce((n, f) => n + statSync(f).size, 0);
    expect(bytes).toBeLessThan(600 * 1024);
  });

  it('bundles the running version and its release notes', () => {
    const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
    const js = readFileSync(mainJs(), 'utf8');
    expect(js).toMatch(new RegExp(`["'\`]${version.replaceAll('.', '\\.')}["'\`]`));
    expect(js).toContain(`## ${version} —`);
  });

  it('ships the icons', () => {
    for (const f of ['favicon.svg', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png']) {
      expect(existsSync(join(dist, f)), f).toBe(true);
    }
  });

  it('prefixes asset URLs in index.html with BASE_PATH', () => {
    const html = read('index.html');
    expect(html).toContain(`href="${base}favicon.svg"`);
    expect(html).toMatch(new RegExp(`src="${base}assets/index-[\\w-]+\\.js"`));
  });
});

describe('manifest', () => {
  const m = JSON.parse(read('manifest.webmanifest'));

  it('has the required fields', () => {
    expect(m).toMatchObject({ name: 'Catalog', short_name: 'Catalog', display: 'standalone' });
    expect(m.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(m.icons.some((i) => i.purpose === 'maskable')).toBe(true);
  });

  it('scopes start_url and scope to BASE_PATH', () => {
    expect(m.start_url).toBe(base);
    expect(m.scope).toBe(base);
  });
});

describe('service worker', () => {
  const sw = read('sw.js');

  it('precaches the app shell, scripts, styles and fonts', () => {
    expect(sw).toContain('index.html');
    expect(sw).toMatch(/assets\/index-[\w-]+\.js/);
    expect(sw).toMatch(/assets\/index-[\w-]+\.css/);
    expect(sw).toMatch(/\.woff2/);
  });

  it('only takes over early when asked (Restart now); never skips waiting on its own', () => {
    expect(sw).toMatch(/SKIP_WAITING/);
    expect(sw.match(/skipWaiting\(\)/g)).toHaveLength(1);
  });

  it('caches covers for offline use, capped and dropped first when storage runs short', () => {
    expect(sw).toContain('covers.openlibrary.org');
    expect(sw).toMatch(/cacheName:\s*"covers"/);
    expect(sw).toMatch(/maxEntries:\s*500/);
    expect(sw).toMatch(/purgeOnQuotaError:\s*(true|!0)/);
  });

  it('never caches the book-search APIs (their answers go stale)', () => {
    expect(sw).not.toContain('openlibrary.org/search');
    expect(sw).not.toContain('googleapis.com');
  });
});

describe('iOS launch screens', () => {
  const html = read('index.html');
  const links = [...html.matchAll(/<link rel="apple-touch-startup-image"[^>]*>/g)].map(([tag]) => ({
    media: tag.match(/media="([^"]*)"/)[1],
    href: tag.match(/href="([^"]*)"/)[1],
  }));
  const pngSize = (file) => {
    const b = readFileSync(file);
    return [b.readUInt32BE(16), b.readUInt32BE(20)];
  };

  it('link a light and a dark image for every iPhone screen size', () => {
    expect(links).toHaveLength(SPLASH_DEVICES.length * 2);
    for (const { href } of links) {
      expect(href.startsWith(`${base}splash/`), href).toBe(true);
      const d = SPLASH_DEVICES.find((x) => href.includes(`${x.width}x${x.height}-${x.ratio}x`));
      expect(pngSize(join(dist, href.slice(base.length)))).toEqual([d.width * d.ratio, d.height * d.ratio]);
    }
  });

  it('are left out of the offline download', () => {
    expect(read('sw.js')).not.toContain('splash/');
  });
});
