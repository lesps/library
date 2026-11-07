import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { openStore, createMemoryStore, DB_VERSION } from '../../src/db/store.js';
import { createBook } from '../../src/lib/book.js';
import { createNote, createCollection } from '../../src/lib/records.js';

const T = 1_700_000_000_000;
let dbn = 0;
const fresh = () => openStore({ name: `test-${dbn++}` });

const kinds = [
  ['indexeddb', fresh],
  ['memory', async () => createMemoryStore()],
];

describe.each(kinds)('%s store', (kind, make) => {
  it('starts empty, with default settings', async () => {
    const s = await make();
    const { data, meta } = await s.loadAll();
    expect(data.books).toEqual([]);
    expect(data.settings.cats).toBe('lively');
    expect(meta).toEqual({});
    expect(s.kind).toBe(kind);
  });

  it('commits records, settings and device-only meta, and reads them back', async () => {
    const s = await make();
    const b = createBook({ title: 'Dune' }, { now: T, id: 'b1' });
    await s.commit({
      books: [b],
      notes: [createNote({ bookId: 'b1', text: 'hi' }, { now: T, id: 'n1' })],
      collections: [createCollection({ name: 'Sci-fi' }, { now: T, id: 'c1' })],
      settings: { cats: 'off', updatedAt: T },
      meta: { lastExport: T, prefs: { view: 'list' } },
    });
    const { data, meta } = await s.loadAll();
    expect(data.books).toEqual([b]);
    expect(data.notes[0].text).toBe('hi');
    expect(data.collections[0].name).toBe('Sci-fi');
    expect(data.settings).toEqual({ cats: 'off', updatedAt: T });
    expect(meta).toEqual({ lastExport: T, prefs: { view: 'list' } });
  });

  it('overwrites a record with the same id', async () => {
    const s = await make();
    const b = createBook({ title: 'Dune' }, { now: T, id: 'b1' });
    await s.commit({ books: [b] });
    await s.commit({ books: [{ ...b, rating: 5 }] });
    const { data } = await s.loadAll();
    expect(data.books).toHaveLength(1);
    expect(data.books[0].rating).toBe(5);
  });

  it('skips stored records that no longer validate instead of failing to load', async () => {
    const s = await make();
    await s.commit({ books: [createBook({ title: 'Ok' }, { now: T, id: 'ok' }), { id: 'broken' }] });
    const { data } = await s.loadAll();
    expect(data.books.map((b) => b.id)).toEqual(['ok']);
  });

  it('saves, lists, reads back and deletes snapshots', async () => {
    const s = await make();
    const data = { books: [createBook({ title: 'Dune' }, { now: T, id: 'b1' })], notes: [], progress: [], collections: [], settings: { cats: 'lively', updatedAt: 0 } };
    const id = await s.saveSnapshot({ at: T, reason: 'import', version: T, data });
    const list = await s.listSnapshots();
    expect(list).toEqual([{ id, at: T, reason: 'import', version: T, counts: { books: 1, read: 0, notes: 0, collections: 0 } }]);
    expect((await s.readSnapshot(id)).books[0].title).toBe('Dune');
    await s.deleteSnapshots([id]);
    expect(await s.listSnapshots()).toEqual([]);
    expect(await s.readSnapshot(id)).toBe(null);
  });
});

describe('indexeddb store', () => {
  it('is all-or-nothing: a commit that fails part-way writes nothing', async () => {
    const s = await fresh();
    const ok = createBook({ title: 'Ok' }, { now: T, id: 'ok' });
    const unclonable = { ...createBook({ title: 'Bad' }, { now: T, id: 'bad' }), fn: () => 1 };
    await expect(s.commit({ books: [ok, unclonable] })).rejects.toThrow();
    expect((await s.loadAll()).data.books).toEqual([]);
  });

  it('persists across reopening', async () => {
    const name = `persist-${dbn++}`;
    const a = await openStore({ name });
    await a.commit({ books: [createBook({ title: 'Dune' }, { now: T, id: 'b1' })] });
    a.close();
    const b = await openStore({ name });
    expect((await b.loadAll()).data.books[0].title).toBe('Dune');
  });

  it('is at the current schema version', () => expect(DB_VERSION).toBeGreaterThanOrEqual(1));
});
