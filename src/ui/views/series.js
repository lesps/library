import { h, plural } from '../dom.js';
import { ICONS } from '../icons.js';
import { coverEl, displayTitle } from '../cover.js';
import { mascot } from '../cat-layer.js';
import { stamp } from './library.js';
import { booksInSeries, seriesList, seriesKey, matchMember, bySeriesNumber } from '../../lib/series.js';

// One shelf in series order: the library's books, and, once Wikidata has been asked, the gaps
// between them as rows to tick. A library book Wikidata lists without a series yet joins the shelf.
function shelfEntries(state, books, look) {
  const entries = books.map((b) => ({ book: b, seriesNumber: b.seriesNumber, title: b.title }));
  if (look?.phase !== 'done') return entries;
  for (const m of look.members) {
    const have = matchMember(state.data.books, m);
    if (!have) entries.push({ member: m, seriesNumber: m.number, title: m.title });
    else if (!entries.some((e) => e.book?.id === have.id)) entries.push({ book: have, seriesNumber: have.seriesNumber || m.number, title: have.title });
  }
  return entries.sort(bySeriesNumber);
}

function row(ctx, name, look, e) {
  const { actions } = ctx;
  if (e.book) {
    const b = e.book;
    return h('li', {},
      h('button', { type: 'button', class: 'sb-open', onclick: () => actions.go(`/book/${b.id}`) },
        h('span', { class: 'sb-number' }, e.seriesNumber || '–'),
        coverEl(b, { size: 'S', cls: 'thumb' }),
        h('span', { class: 'sb-text' },
          h('span', { class: 'sb-title' }, displayTitle(b)),
          h('span', { class: 'sb-author' }, b.authors.join(', '))),
        stamp(b.status)));
  }
  const m = e.member;
  return h('li', { class: 'missing' },
    h('label', { class: 'sb-pick' },
      h('span', { class: 'sb-number' }, m.number || '–'),
      h('span', { class: 'slot', 'aria-hidden': 'true' }),
      h('span', { class: 'sb-text' },
        h('span', { class: 'sb-title' }, m.title),
        h('span', { class: 'sb-author' }, [m.year, 'Not in your library'].filter(Boolean).join(' · '))),
      h('input', { type: 'checkbox', checked: look.picked.has(m.id), 'aria-label': `Add ${m.title}`, onchange: (ev) => actions.pickRest(name, m.id, ev.target.checked) })));
}

// Under the shelf: how to find the rest, where the lookup is up to, and the Add button.
function restCard(ctx, name, look, entries) {
  const { state, actions } = ctx;
  const online = state.online;
  const find = (label) => h('button', {
    type: 'button', class: 'btn find-rest', disabled: !online, title: online ? null : 'Needs the internet', onclick: () => actions.findRest(name),
  }, label);
  const phase = look?.phase ?? 'idle';
  if (phase === 'done') {
    const adding = entries.filter((e) => e.member && look.picked.has(e.member.id)).length;
    const tagging = entries.filter((e) => e.book && !e.book.seriesName).length;
    const missing = entries.filter((e) => e.member).length;
    return h('section', { class: 'rest card done' },
      missing ? null : h('p', {}, 'You have every book Wikidata lists in this series.'),
      adding || tagging ? h('button', { type: 'button', class: 'btn primary add-rest', onclick: () => actions.addRest(name) },
        adding ? `Add ${plural(adding, 'book')} to Want to read` : `Mark ${plural(tagging, 'book')} as part of this series`) : null,
      missing && !adding ? h('p', { class: 'muted' }, 'Tick the books you want to add.') : null,
      h('p', { class: 'source muted' }, 'Series list from Wikidata. Covers and page counts fill in from Open Library.'));
  }
  return h('section', { class: 'rest card' },
    h('h2', {}, 'The rest of the series'),
    phase === 'looking' ? h('p', { class: 'muted looking' }, 'Looking on Wikidata…')
      : phase === 'none' ? h('p', { class: 'none' }, 'Wikidata doesn’t list the books in this series yet, or didn’t recognise these books.')
        : phase === 'error' ? [h('p', { class: 'error' }, 'Wikidata didn’t answer. Try again in a moment.'), find('Try again')]
          : [h('p', {}, 'Look up the other books in this series, then choose which to add to your to-read list.'),
            find('Find the rest'),
            online ? null : h('p', { class: 'muted' }, 'Needs the internet.')]);
}

export function seriesView(ctx) {
  const { state, actions } = ctx;
  const name = state.route.id ?? '';
  const books = booksInSeries(state.data.books, name);
  const back = h('div', { class: 'detail-top' }, h('button', { type: 'button', class: 'icon-btn back', 'aria-label': 'Back', html: ICONS.back, onclick: () => actions.back() }));
  if (!books.length) {
    return h('section', { class: 'series-view' }, back, h('div', { class: 'empty' }, mascot('missing', 'big'),
      h('h1', {}, 'No books in this series'),
      h('button', { type: 'button', class: 'btn', onclick: () => actions.go('/collections') }, 'See all series')));
  }
  const look = actions.seriesLookup(name);
  const entries = shelfEntries(state, books, look);
  const have = entries.filter((e) => e.book).length;
  const display = seriesList(books).find((s) => s.key === seriesKey(name))?.name ?? name;
  const authors = [...new Set(books.map((b) => b.authors[0]).filter(Boolean))];
  const count = look?.phase === 'done' ? `${have} of ${entries.length} in your library` : `${plural(have, 'book')} in your library`;
  return h('section', { class: 'series-view' }, back,
    h('header', { class: 'series-head' },
      h('p', { class: 'eyebrow' }, 'Series'),
      h('h1', {}, display),
      h('p', { class: 'muted' }, [count, authors.length === 1 ? `by ${authors[0]}` : null].filter(Boolean).join(' · '))),
    h('ol', { class: 'series-books' }, entries.map((e) => row(ctx, name, look, e))),
    restCard(ctx, name, look, entries));
}
