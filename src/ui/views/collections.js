import { h, sheet, plural } from '../dom.js';
import { ICONS } from '../icons.js';
import { coverEl } from '../cover.js';
import { mascot } from '../cat-layer.js';

export function collectionsView({ state, actions }) {
  const cs = actions.collections();
  const live = state.data.books.filter((b) => !b.deleted);
  const head = h('header', { class: 'top' }, h('h1', {}, 'Collections'),
    h('div', { class: 'top-actions' }, h('button', { type: 'button', class: 'btn small primary new-collection', onclick: () => actions.createCollection() }, 'New collection')));
  if (!cs.length) {
    return h('section', { class: 'collections-view' }, head, h('div', { class: 'empty' }, mascot('busy', 'big'),
      h('p', {}, 'Collections group books however you like: a genre, a book club, a shelf in the hallway. A book can be in as many as you want.'),
      h('p', { class: 'muted' }, 'Tip: in the library, tap Select, pick some books, then Collection.')));
  }
  return h('section', { class: 'collections-view' }, head,
    h('ul', { class: 'collections' }, cs.map((c, i) => {
      const books = live.filter((b) => b.collectionIds.includes(c.id));
      return h('li', { class: 'collection', 'data-id': c.id },
        h('button', { type: 'button', class: 'open', onclick: () => actions.showCollection(c.id) },
          h('span', { class: 'fan' }, books.slice(0, 3).map((b) => coverEl(b, { size: 'S', cls: 'thumb' }))),
          h('span', { class: 'c-text' }, h('span', { class: 'name' }, c.name), h('span', { class: 'count' }, plural(books.length, 'book')))),
        h('button', {
          type: 'button', class: 'icon-btn more', 'aria-label': `Options for ${c.name}`, html: ICONS.more,
          onclick: () => sheet({ title: c.name, items: [
            { label: 'Rename', onClick: () => actions.renameCollection(c.id) },
            i > 0 && { label: 'Move up', onClick: () => actions.moveCollection(c.id, -1) },
            i < cs.length - 1 && { label: 'Move down', onClick: () => actions.moveCollection(c.id, 1) },
            { label: 'Delete', danger: true, onClick: () => actions.deleteCollection(c.id) },
          ] }),
        }));
    })),
    h('button', { type: 'button', class: 'link', onclick: () => actions.showCollection('none') }, `Books in no collection: ${live.filter((b) => !b.collectionIds.length).length}`));
}
