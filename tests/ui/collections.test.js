// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { mount, book } from './helpers.js';
import { createCollection } from '../../src/lib/records.js';

const cs = () => [
  createCollection({ name: 'Classics', rank: 'b' }, { now: 1, id: 'c1' }),
  createCollection({ name: 'Sci-fi', rank: 'c' }, { now: 1, id: 'c2' }),
];
const names = (t) => t.$$('.collections .collection .name').map((e) => e.textContent);

describe('collections tab', () => {
  it('lists collections in order with book counts', async () => {
    const t = await mount({ books: [book({ title: 'Emma', collectionIds: ['c1'] })], data: { collections: cs() } });
    t.tab('collections');
    expect(names(t)).toEqual(['Classics', 'Sci-fi']);
    expect(t.$('.collection[data-id="c1"] .count').textContent).toBe('1 book');
  });

  it('creates, renames, reorders and deletes', async () => {
    const t = await mount({ data: { collections: cs() } });
    t.tab('collections');
    t.$('button.new-collection').click();
    t.type('.prompt-input', 'Cozy');
    t.$('.prompt-ok').click();
    expect(names(t)).toEqual(['Classics', 'Sci-fi', 'Cozy']);
    t.$('.collection[data-id="c1"] .more').click();
    t.button('Rename', t.$('.sheet')).click();
    t.type('.prompt-input', 'Old classics');
    t.$('.prompt-ok').click();
    expect(names(t)[0]).toBe('Old classics');
    t.$('.collection[data-id="c1"] .more').click();
    t.button('Move down', t.$('.sheet')).click();
    expect(names(t)).toEqual(['Sci-fi', 'Old classics', 'Cozy']);
    t.$('.collection[data-id="c2"] .more').click();
    t.button('Delete', t.$('.sheet')).click();
    t.$('.confirm-ok').click();
    expect(names(t)).toEqual(['Old classics', 'Cozy']);
  });

  it('will not create a duplicate name', async () => {
    const t = await mount({ data: { collections: cs() } });
    t.tab('collections');
    t.$('button.new-collection').click();
    t.type('.prompt-input', 'classics');
    t.$('.prompt-ok').click();
    expect(names(t)).toEqual(['Classics', 'Sci-fi']);
    expect(t.$('.toast').textContent).toMatch(/already/);
  });
});
