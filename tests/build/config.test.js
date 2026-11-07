import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// The service worker is the same in both plugin modes; the difference is the page's own code:
// 'autoUpdate' reloads the page when a new version takes over, 'prompt' never does on its own.
it('lets updates wait for the next launch (or Restart now) instead of reloading the page', () => {
  const config = readFileSync(new URL('../../vite.config.js', import.meta.url), 'utf8');
  expect(config).toMatch(/registerType:\s*'prompt'/);
});
