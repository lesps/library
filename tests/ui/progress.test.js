// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { mount, book, fakeFetch } from './helpers.js';

// A fetch that answers the first lookup and then waits, so the run can be seen half-way.
const paused = () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  let n = 0;
  const fetch = fakeFetch([['openlibrary.org/search.json', () => (++n === 1 ? { docs: [{ key: '/works/OL1W', cover_i: 5, subject: ['Deserts'] }] } : gate.then(() => ({ docs: [] })))]]);
  return { fetch, release: () => release() };
};

describe('background look-up progress', () => {
  it('shows how far the look-ups have got, and roughly how long is left', async () => {
    const { fetch, release } = paused();
    const books = Array.from({ length: 3 }, (_, i) => book({ title: `B${i}` }));
    const t = await mount({ books, fetch });
    const run = t.app.actions.runWorkers();
    await t.tick(6);
    const bar = t.$('section.library .work-progress');
    expect(bar.querySelector('[role="progressbar"]').getAttribute('aria-valuenow')).toBe('1');
    expect(bar.querySelector('[role="progressbar"]').getAttribute('aria-valuemax')).toBe('3');
    expect(bar.textContent).toMatch(/1 of 3 books/);
    expect(bar.textContent).toMatch(/less than a minute left/);
    release();
    await run;
    expect(t.$('.work-progress')).toBe(null);
  });

  it('estimates minutes for a long run, from about one book a second', async () => {
    const { fetch, release } = paused();
    const books = Array.from({ length: 101 }, (_, i) => book({ title: `B${i}` }));
    const t = await mount({ books, fetch });
    const run = t.app.actions.runWorkers();
    await t.tick(6);
    expect(t.$('.work-progress').textContent).toMatch(/1 of 101 books · about 2 min left/);
    release();
    await run;
  });

  it('appears on Your lanes and in Settings too, and says when it’s waiting for the internet', async () => {
    const { fetch, release } = paused();
    const books = Array.from({ length: 3 }, (_, i) => book({ title: `B${i}` }));
    const t = await mount({ books, fetch });
    const run = t.app.actions.runWorkers();
    await t.tick(6);
    t.tab('settings');
    expect(t.$('.settings-view .work-progress')).toBeTruthy();
    t.app.actions.go('/lanes');
    expect(t.$('.lanes-view .work-progress')).toBeTruthy();
    t.net.set(false);
    expect(t.$('.lanes-view .work-progress').textContent).toMatch(/when you’re back online/);
    release();
    await run;
  });
});
