import { h, sheet, plural } from '../dom.js';
import { ICONS } from '../icons.js';
import { coverEl } from '../cover.js';
import { mascot } from '../cat-layer.js';
import { seriesList } from '../../lib/series.js';

const fan = (books) => h('span', { class: 'fan' }, books.slice(0, 3).map((b) => coverEl(b, { size: 'S', cls: 'thumb' })));

function collectionList({ state, actions }, cs, live) {
  const custom = state.data.settings.collectionOrder === 'custom';
  return [
    h('div', { class: 'collection-order', role: 'group', 'aria-label': 'Order collections' },
      [['az', 'A–Z'], ['custom', 'My order']].map(([v, label]) => h('button', {
        type: 'button', class: 'chip', 'aria-pressed': String((custom ? 'custom' : 'az') === v), onclick: () => actions.setCollectionOrder(v),
      }, label))),
    h('ul', { class: 'collections' }, cs.map((c, i) => {
      const books = live.filter((b) => b.collectionIds.includes(c.id));
      return h('li', { class: 'collection', 'data-id': c.id },
        h('button', { type: 'button', class: 'open', onclick: () => actions.showCollection(c.id) },
          fan(books),
          h('span', { class: 'c-text' }, h('span', { class: 'name' }, c.name), h('span', { class: 'count' }, plural(books.length, 'book')))),
        h('button', {
          type: 'button', class: 'icon-btn more', 'aria-label': `Options for ${c.name}`, html: ICONS.more,
          onclick: () => sheet({ title: c.name, items: [
            { label: 'Rename', onClick: () => actions.renameCollection(c.id) },
            custom && i > 0 && { label: 'Move up', onClick: () => actions.moveCollection(c.id, -1) },
            custom && i < cs.length - 1 && { label: 'Move down', onClick: () => actions.moveCollection(c.id, 1) },
            { label: 'Delete', danger: true, onClick: () => actions.deleteCollection(c.id) },
          ] }),
        }));
    })),
    h('button', { type: 'button', class: 'link', onclick: () => actions.showCollection('none') }, `Books in no collection: ${live.filter((b) => !b.collectionIds.length).length}`),
  ];
}

// Series group themselves: every book with a series name is listed under it.
function seriesSection({ actions }, series) {
  return h('section', { class: 'series-section' },
    h('h2', { class: 'section-title' }, 'Series'),
    h('ul', { class: 'collections series-list' }, series.map((s) => h('li', { class: 'collection' },
      h('button', { type: 'button', class: 'open', onclick: () => actions.openSeries(s.name) },
        fan(s.books),
        h('span', { class: 'c-text' }, h('span', { class: 'name' }, s.name), h('span', { class: 'count' }, plural(s.books.length, 'book'))))))));
}

export function collectionsView(ctx) {
  const { state, actions } = ctx;
  const cs = actions.collections();
  const live = state.data.books.filter((b) => !b.deleted);
  const series = seriesList(live);
  const head = h('header', { class: 'top' }, h('h1', {}, 'Collections'),
    h('div', { class: 'top-actions' }, h('button', { type: 'button', class: 'btn small primary new-collection', onclick: () => actions.createCollection() }, 'New collection')));
  const intro = 'Collections group books however you like: a genre, a book club, a shelf in the hallway. A book can be in as many as you want.';
  if (!cs.length && !series.length) {
    return h('section', { class: 'collections-view' }, head, h('div', { class: 'empty' }, mascot('busy', 'big'),
      h('p', {}, intro),
      h('p', { class: 'muted' }, 'Tip: in the library, tap Select, pick some books, then Collection.')));
  }
  return h('section', { class: 'collections-view' }, head,
    cs.length ? collectionList(ctx, cs, live) : h('p', { class: 'muted no-collections' }, `${intro} To make one, tap New collection, or Select books in the library.`),
    series.length ? seriesSection(ctx, series) : null);
}
