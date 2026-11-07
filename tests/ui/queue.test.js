// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { mount, book } from './helpers.js';

const queue = () => [
  book({ title: 'One', status: 'want', queueRank: 'a' }),
  book({ title: 'Two', status: 'want', queueRank: 'b' }),
  book({ title: 'Three', status: 'want', queueRank: 'c' }),
  book({ title: 'Read', status: 'read' }),
];
const order = (t) => t.$$('.queue .qitem .q-title').map((e) => e.textContent);

describe('to-read queue', () => {
  it('lists want-to-read books in queue order', async () => {
    const t = await mount({ books: queue() });
    t.tab('queue');
    expect(order(t)).toEqual(['One', 'Two', 'Three']);
  });

  it('moves books up, down and to the top, writing only the moved book', async () => {
    const t = await mount({ books: queue() });
    t.tab('queue');
    t.$$('.queue .qitem')[2].querySelector('.up').click();
    expect(order(t)).toEqual(['One', 'Three', 'Two']);
    t.$$('.queue .qitem')[0].querySelector('.down').click();
    expect(order(t)).toEqual(['Three', 'One', 'Two']);
    t.$$('.queue .qitem')[2].querySelector('.top').click();
    expect(order(t)).toEqual(['Two', 'Three', 'One']);
    const changed = t.app.state().data.books.filter((b) => b.fieldAt.queueRank > b.addedAt);
    expect(changed.length).toBeLessThanOrEqual(3);
  });

  it('starts reading from the queue', async () => {
    const t = await mount({ books: queue() });
    t.tab('queue');
    t.$$('.queue .qitem')[0].querySelector('.start').click();
    expect(order(t)).toEqual(['Two', 'Three']);
    expect(t.live().find((b) => b.title === 'One').status).toBe('reading');
  });

  it('shows a cat when the queue is empty', async () => {
    const t = await mount();
    t.tab('queue');
    expect(t.$('.empty')).toBeTruthy();
  });
});
