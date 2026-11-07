// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { mount, book, T0 } from './helpers.js';
import { createCollection } from '../../src/lib/records.js';

const open = async (fields, extra = {}) => {
  const b = book(fields);
  const t = await mount({ books: [b], ...extra });
  t.app.actions.go(`/book/${b.id}`);
  return { t, b, get: () => t.app.state().data.books.find((x) => x.id === b.id) };
};

describe('book page', () => {
  it('shows the book', async () => {
    const { t } = await open({ title: 'Dune', authors: ['Frank Herbert'], pages: 412, year: 1965, isbn13: '9780441013593' });
    expect(t.$('.book-detail h1').textContent).toBe('Dune');
    expect(t.$('.book-detail .authors').textContent).toBe('Frank Herbert');
    expect(t.$('.catalog-card').textContent).toContain('978-0441013593');
  });

  it('changes status with the dates following', async () => {
    const { t, get } = await open({ title: 'Dune', status: 'want' });
    t.$('.status-picker [data-status="reading"]').click();
    expect(get()).toMatchObject({ status: 'reading', started: '2026-11-07' });
    expect(t.$('.status-picker [data-status="reading"]').getAttribute('aria-pressed')).toBe('true');
  });

  it('rates with paws; tapping the same paw clears it', async () => {
    const { t, get } = await open({ title: 'Dune' });
    t.$('.rating [data-rating="4"]').click();
    expect(get().rating).toBe(4);
    t.$('.rating [data-rating="4"]').click();
    expect(get().rating).toBe(0);
  });

  it('records progress by page and offers to finish at the last page', async () => {
    const { t, get } = await open({ title: 'Dune', status: 'reading', pages: 400 });
    t.type('.progress input.page', '100');
    t.$('.progress button.update-progress').click();
    expect(t.$('.progress .pct').textContent).toBe('25%');
    expect(t.app.state().data.progress.at(-1)).toMatchObject({ page: 100 });
    t.type('.progress input.page', '400');
    t.$('.progress button.update-progress').click();
    t.button('Mark as read').click();
    expect(get().status).toBe('read');
  });

  it('records progress as a percentage when the page count is unknown', async () => {
    const { t } = await open({ title: 'Dune', status: 'reading' });
    t.type('.progress input.percent', '40');
    t.$('.progress button.update-progress').click();
    expect(t.app.state().data.progress.at(-1)).toMatchObject({ percent: 40, page: null });
  });

  it('adds, edits and deletes notes', async () => {
    const { t } = await open({ title: 'Dune' });
    t.type('textarea.note-text', 'Fear is the mind-killer.');
    t.type('input.note-page', '8');
    t.$('button.add-note').click();
    expect(t.$('.note .note-text').textContent).toBe('Fear is the mind-killer.');
    expect(t.$('.note .note-page').textContent).toBe('p. 8');
    t.$('.note .edit-note').click();
    t.type('dialog textarea', 'I must not fear.');
    t.button('Save', t.$('dialog')).click();
    expect(t.$('.note .note-text').textContent).toBe('I must not fear.');
    t.$('.note .delete-note').click();
    expect(t.$('.note')).toBe(null);
    t.button('Undo', t.$('.toast')).click();
    expect(t.$('.note .note-text').textContent).toBe('I must not fear.');
  });

  it('toggles collections and creates new ones', async () => {
    const { t, get } = await open({ title: 'Dune' }, { data: { collections: [createCollection({ name: 'Sci-fi', rank: 'i' }, { now: T0, id: 'c1' })] } });
    t.$('.collections-picker [data-collection="c1"]').click();
    expect(get().collectionIds).toEqual(['c1']);
    t.$('.collections-picker [data-collection="c1"]').click();
    expect(get().collectionIds).toEqual([]);
    t.$('.collections-picker .new-collection').click();
    t.type('.prompt-input', 'Desert');
    t.$('.prompt-ok').click();
    expect(get().collectionIds).toHaveLength(1);
  });

  it('edits details', async () => {
    const { t, get } = await open({ title: 'Dun', authors: ['F. Herbert'] });
    t.$('button.edit-details').click();
    t.type('dialog [name="title"]', 'Dune');
    t.type('dialog [name="authors"]', 'Frank Herbert, Someone Else');
    t.type('dialog [name="pages"]', '412');
    t.button('Save', t.$('dialog')).click();
    expect(get()).toMatchObject({ title: 'Dune', authors: ['Frank Herbert', 'Someone Else'], pages: 412 });
  });

  it('writes a review', async () => {
    const { t, get } = await open({ title: 'Dune' });
    t.$('button.edit-review').click();
    t.type('dialog textarea', 'Spice must flow.\nGreat.');
    t.button('Save', t.$('dialog')).click();
    expect(get().review).toBe('Spice must flow.\nGreat.');
    expect(t.$('.review-text').textContent).toBe('Spice must flow.\nGreat.');
  });

  it('deletes with undo, returning to the library', async () => {
    const { t, get } = await open({ title: 'Dune' });
    t.$('button.delete-book').click();
    expect(get().deleted).toBe(true);
    expect(t.$('main').dataset.view).toBe('library');
    t.button('Undo', t.$('.toast')).click();
    expect(get().deleted).toBe(false);
  });

  it('shows a friendly page for a book that is gone', async () => {
    const t = await mount();
    t.app.actions.go('/book/nope');
    expect(t.$('.missing')).toBeTruthy();
  });

  it('never renders book text as HTML', async () => {
    const { t } = await open({ title: '<img src=x onerror=alert(1)>', authors: ['<b>x</b>'], review: '<script>1</script>' });
    expect(t.$('.book-detail img[onerror]')).toBe(null);
    expect(t.$('.book-detail h1').textContent).toBe('<img src=x onerror=alert(1)>');
  });
});
