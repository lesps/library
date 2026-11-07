// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { mount, book } from './helpers.js';
import { createRead } from '../../src/lib/reads.js';
import { createProgress } from '../../src/lib/records.js';

const T = new Date(2026, 10, 7, 12).getTime();
const read = (b, f, id) => createRead({ bookId: b.id, ...f }, { now: T - 1000, id });

async function openBook(b, reads, extra = {}) {
  const t = await mount({ books: [b], data: { reads }, ...extra });
  t.app.actions.go(`/book/${b.id}`);
  const mine = () => t.app.state().data.reads.filter((r) => r.bookId === b.id && !r.deleted);
  return { t, mine, get: () => t.app.state().data.books.find((x) => x.id === b.id) };
}

describe('reads on the book page', () => {
  it('lists every read: in progress first, then newest, then undated', async () => {
    const b = book({ title: 'Dune', status: 'reading' });
    const { t } = await openBook(b, [
      read(b, { finished: '2021-07-04' }, 'a'),
      read(b, { started: '2026-03-02', finished: '2026-03-20' }, 'b'),
      read(b, { done: true }, 'c'),
      read(b, { started: '2026-11-01' }, 'd'),
    ]);
    expect(t.$('.reads .reads-count').textContent).toBe('Read 3 times');
    expect(t.$$('.reads .read .read-dates').map((e) => e.textContent)).toEqual([
      'Reading now, started Nov 1', 'Mar 2 – Mar 20', 'Finished Jul 4, 2021', 'Date unknown',
    ]);
  });

  it('starts a reread: the past reads stay, a new one opens today', async () => {
    const b = book({ title: 'Dune', status: 'read' });
    const { t, mine, get } = await openBook(b, [read(b, { finished: '2021-07-04' }, 'a')]);
    t.$('.reads button.start-reread').click();
    expect(get().status).toBe('reading');
    expect(mine().map((r) => [r.started, r.finished, r.done]).sort()).toEqual([['', '2021-07-04', true], ['2026-11-07', '', false]]);
    expect(t.$('.reads button.start-reread')).toBe(null);
  });

  it('finishing closes the read in progress', async () => {
    const b = book({ title: 'Dune', status: 'reading' });
    const { t, mine } = await openBook(b, [read(b, { started: '2026-10-01' }, 'o')]);
    t.$('.status-picker [data-status="read"]').click();
    expect(mine()).toEqual([expect.objectContaining({ id: 'o', started: '2026-10-01', finished: '2026-11-07', done: true })]);
  });

  it('a reread starts its progress from zero', async () => {
    const b = book({ title: 'Dune', status: 'read', pages: 400 });
    const old = createProgress({ bookId: b.id, page: 400 }, { now: T - 5000, id: 'p' });
    const { t } = await openBook(b, [read(b, { finished: '2021-07-04' }, 'a')], { data: { reads: [read(b, { finished: '2021-07-04' }, 'a')], progress: [old] } });
    t.$('.reads button.start-reread').click();
    expect(t.$('.progress .pct').textContent).toBe('');
    expect(t.$('.progress input.page').value).toBe('');
  });

  it('adds a past read, dates optional', async () => {
    const b = book({ title: 'Dune', status: 'read' });
    const { t, mine } = await openBook(b, [read(b, { finished: '2026-01-01' }, 'a')]);
    t.$('.reads button.add-read').click();
    t.type('dialog [name="finished"]', '2019-05-05');
    t.button('Save', t.$('dialog')).click();
    t.$('.reads button.add-read').click();
    t.button('Save', t.$('dialog')).click();
    expect(mine().map((r) => r.finished).sort()).toEqual(['', '2019-05-05', '2026-01-01']);
    expect(t.$('.reads .reads-count').textContent).toBe('Read 3 times');
  });

  it('edits a read’s dates, refusing a start after the finish', async () => {
    const b = book({ title: 'Dune', status: 'read' });
    const { t, mine } = await openBook(b, [read(b, { done: true }, 'a')]);
    t.$('.read .edit-read').click();
    t.type('dialog [name="started"]', '2025-02-10');
    t.type('dialog [name="finished"]', '2025-02-01');
    t.button('Save', t.$('dialog')).click();
    expect(t.$('dialog')).toBeTruthy();
    expect(t.$('.toast').textContent).toMatch(/start.*after/i);
    t.type('dialog [name="finished"]', '2025-03-01');
    t.button('Save', t.$('dialog')).click();
    expect(mine()[0]).toMatchObject({ started: '2025-02-10', finished: '2025-03-01', done: true });
  });

  it('deletes a read, with undo', async () => {
    const b = book({ title: 'Dune', status: 'read' });
    const { t, mine } = await openBook(b, [read(b, { finished: '2021-07-04' }, 'a'), read(b, { finished: '2026-01-01' }, 'b')]);
    t.$$('.read .delete-read')[0].click();
    expect(mine().map((r) => r.id)).toEqual(['a']);
    t.button('Undo', t.$('.toast')).click();
    expect(mine().map((r) => r.id).sort()).toEqual(['a', 'b']);
  });
});

describe('reads elsewhere', () => {
  it('library rows say how many times a book was read', async () => {
    const b = book({ title: 'Dune', status: 'read' });
    const t = await mount({ books: [b], data: { reads: [read(b, { finished: '2021-07-04' }, 'a'), read(b, { done: true }, 'b')] } });
    t.$('button.layout').click();
    expect(t.$('.shelf .book .reads-count').textContent).toBe('Read 2×');
  });

  it('marking several books read gives each a read finished today', async () => {
    const t = await mount({ books: [book({ title: 'A', status: 'want' }), book({ title: 'B', status: 'reading' })] });
    t.$('button.select-mode').click();
    t.$$('.shelf .book').forEach((e) => e.click());
    t.$('[data-bulk="status"]').click();
    t.$('.sheet [data-status="read"]').click();
    expect(t.app.state().data.reads.filter((r) => r.done && r.finished === '2026-11-07')).toHaveLength(2);
  });

  it('a reread counts toward the year’s goal and is marked in the stats', async () => {
    const b = book({ title: 'Dune', status: 'read', pages: 400 });
    const reads = [read(b, { finished: '2021-07-04' }, 'a'), read(b, { finished: '2026-02-02' }, 'b')];
    const t = await mount({ books: [b], data: { reads, settings: { cats: 'lively', updatedAt: 1, goals: { 2026: { books: 10, pages: null } } } } });
    t.tab('reading');
    expect(t.$('.goal-books .goal-figure').textContent).toBe('1 of 10 books');
    t.app.actions.go('/stats');
    expect(t.$('.finished-list .reread').textContent).toBe('Reread');
    expect(t.$$('.kpi').find((k) => k.textContent.includes('Books')).querySelector('.kpi-sub').textContent).toBe('1 reread');
    t.$$('.by-year .col').find((c) => c.dataset.key === '2021').click();
    expect(t.$$('.finished-list .fl-title').map((e) => e.textContent)).toEqual(['Dune']);
  });

  it('adding a book as Read gives it a read finished today', async () => {
    const t = await mount({ online: false });
    t.tab('add');
    t.change('select.add-status', 'read');
    t.type('input.add-search', 'Zine');
    t.$('button.manual').click();
    t.button('Add book', t.$('dialog')).click();
    expect(t.app.state().data.reads).toEqual([expect.objectContaining({ finished: '2026-11-07', done: true })]);
  });
});

describe('notes about a read', () => {
  const setup = async (reads, notes = []) => {
    const b = book({ title: 'Dune', status: reads.some((x) => !x.done) ? 'reading' : 'read' });
    const rs = reads.map((x, i) => read(b, x, `r${i}`));
    const t = await mount({ books: [b], data: { reads: rs, notes: notes.map((n, i) => ({ id: `n${i}`, bookId: b.id, at: T - 100 + i, updatedAt: T, page: null, ...n })) } });
    t.app.actions.go(`/book/${b.id}`);
    return { t, b };
  };
  const added = (t) => t.app.state().data.notes.at(-1);

  it('a note written during a reread is about that read, by default', async () => {
    const { t } = await setup([{ finished: '2021-07-04' }, { started: '2026-11-01' }]);
    expect(t.$('select.note-about').value).toBe('r1');
    t.type('textarea.note-text', 'The ending lands differently now.');
    t.$('button.add-note').click();
    expect(added(t)).toMatchObject({ readId: 'r1', text: 'The ending lands differently now.' });
  });

  it('can be about an earlier read, or the book as a whole', async () => {
    const { t } = await setup([{ finished: '2021-07-04' }, { started: '2026-11-01' }]);
    expect(t.$$('select.note-about option').map((o) => o.textContent)).toEqual(['This read (started Nov 1)', 'Read finished Jul 4, 2021', 'The book in general']);
    t.change('select.note-about', 'r0');
    t.type('textarea.note-text', 'Remembered: I loved Paul here.');
    t.$('button.add-note').click();
    expect(added(t).readId).toBe('r0');
    t.change('select.note-about', '');
    t.type('textarea.note-text', 'General thought.');
    t.$('button.add-note').click();
    expect(added(t)).not.toHaveProperty('readId');
  });

  it('a book read once, with no read in progress, keeps notes about the book', async () => {
    const { t } = await setup([{ finished: '2021-07-04' }]);
    expect(t.$('select.note-about').value).toBe('');
  });

  it('groups notes by read so the reads can be compared', async () => {
    const { t } = await setup([{ finished: '2021-07-04' }, { started: '2026-11-01' }], [
      { text: 'First time: Paul is a hero.', readId: 'r0' },
      { text: 'Now: Paul is a warning.', readId: 'r1' },
      { text: 'Lent to Sam.' },
    ]);
    expect(t.$$('.note-group h3').map((e) => e.textContent)).toEqual(['This read (started Nov 1)', 'Read finished Jul 4, 2021', 'The book in general']);
    expect(t.$$('.note-group')[0].querySelector('.note-text').textContent).toBe('Now: Paul is a warning.');
  });

  it('each read in the Reads card says how many notes it has', async () => {
    const { t } = await setup([{ finished: '2021-07-04' }, { started: '2026-11-01' }], [{ text: 'a', readId: 'r0' }, { text: 'b', readId: 'r0' }]);
    const rows = t.$$('.read');
    expect(rows[1].querySelector('.read-notes').textContent).toBe('2 notes');
    expect(rows[0].querySelector('.read-notes')).toBe(null);
  });

  it('deleting a read keeps its notes, under the book; undo puts them back', async () => {
    const { t } = await setup([{ finished: '2021-07-04' }, { finished: '2026-01-01' }], [{ text: 'old thoughts', readId: 'r0' }]);
    t.$$('.read .delete-read')[1].click();
    expect(t.$$('.note-group h3').map((e) => e.textContent)).toEqual(['The book in general']);
    expect(t.$('.note .note-text').textContent).toBe('old thoughts');
    t.button('Undo', t.$('.toast')).click();
    expect(t.$$('.note-group h3').map((e) => e.textContent)).toEqual(['Read finished Jul 4, 2021']);
  });
});
