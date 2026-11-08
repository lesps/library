import { h, plural } from '../dom.js';
import { ICONS } from '../icons.js';
import { coverEl, displayTitle } from '../cover.js';
import { columnChart, barList } from '../charts.js';
import { workerProgress } from '../progress.js';
import { scopeBooks, writtenYear, byCentury, byDecade, booksWritten, themes, topAuthors } from '../../lib/explore.js';

const SHOWN = 12;
const yearText = (y) => (y == null ? '' : y < 0 ? `${-y} BCE` : String(y));
const byYear = (list) => [...list].sort((a, b) => (writtenYear(a) ?? Infinity) - (writtenYear(b) ?? Infinity) || a.title.localeCompare(b.title));

// The books behind a selection: oldest first, a dozen, then all on request.
function bookList(ctx, books, key) {
  const { state, actions } = ctx;
  const all = state.explore.open.has(key);
  const shown = all ? books : books.slice(0, SHOWN);
  return h('div', { class: 'explore-books' },
    h('ul', {}, shown.map((b) => h('li', {},
      h('button', { type: 'button', class: 'eb-open', onclick: () => actions.go(`/book/${b.id}`) },
        coverEl(b, { size: 'S', cls: 'thumb' }),
        h('span', { class: 'eb-text' }, h('span', { class: 'eb-title' }, displayTitle(b)), h('span', { class: 'eb-author' }, b.authors[0] ?? '')),
        h('span', { class: 'eb-year' }, yearText(writtenYear(b))))))),
    books.length > shown.length ? h('button', { type: 'button', class: 'btn small', onclick: () => actions.exploreShowAll(key) }, `Show all ${books.length}`) : null);
}

export function exploreView(ctx) {
  const { state, actions, now } = ctx;
  const e = state.explore;
  const books = scopeBooks(state.data.books, state.data.reads, e.scope);
  const current = new Date(now()).getFullYear();
  const centuries = byCentury(books, current);
  const noYear = books.filter((b) => writtenYear(b) == null).length;
  const decadeView = e.century && /^\d+$/.test(e.century) && centuries.some((c) => c.key === e.century);
  const ts = themes(books);
  const as = topAuthors(books);
  const theme = ts.find((x) => x.key === e.theme);
  const author = as.find((x) => x.key === e.author);
  const centuryName = centuries.find((c) => c.key === e.century)?.label.split(':')[0];

  return h('section', { class: 'explore-view' },
    h('div', { class: 'detail-top' }, h('button', { type: 'button', class: 'icon-btn back', 'aria-label': 'Back', html: ICONS.back, onclick: () => actions.back() })),
    h('h1', {}, 'Explore your reading'),
    h('p', { class: 'muted' }, `When the ${plural(books.length, 'book')} ${e.scope === 'read' ? 'you’ve read were' : 'in your library were'} written, what they’re about, and who wrote them.`),
    h('div', { class: 'chips scope-chips', role: 'group', 'aria-label': 'Which books' },
      [['read', 'Books read'], ['all', 'Whole library']].map(([v, label]) => h('button', { type: 'button', 'aria-pressed': String(e.scope === v), onclick: () => actions.setExplore({ scope: v }) }, label))),

    h('section', { class: 'card explore-when' },
      h('h2', {}, 'When they were written'),
      centuries.length ? [
        columnChart({ cls: 'by-century', caption: 'By century', data: centuries, selected: e.century, onSelect: (k) => actions.setExplore({ century: e.century === k ? null : k, decade: null }) }),
        decadeView ? columnChart({ cls: 'by-decade', caption: `The ${centuryName} by decade`, data: byDecade(books, e.century, current), selected: e.decade, onSelect: (k) => actions.setExplore({ decade: e.decade === k ? null : k }) }) : null,
        e.century ? bookList(ctx, booksWritten(books, { century: e.century, decade: e.decade }), `when:${e.century}:${e.decade}`) : h('p', { class: 'muted small' }, 'Tap a century to see its books.'),
      ] : h('p', { class: 'muted' }, 'No publication years yet.'),
      noYear ? h('p', { class: 'muted small no-year' }, `${plural(noYear, 'book')} ${noYear === 1 ? 'has' : 'have'} no publication year. Catalog fills them in from Open Library in the background.`) : null),

    h('section', { class: 'card themes' },
      h('h2', {}, 'Themes'),
      ts.length ? [
        barList({ cls: 'theme-bars', data: ts, selected: e.theme, onSelect: (k) => actions.setExplore({ theme: e.theme === k ? null : k }) }),
        theme ? bookList(ctx, byYear(theme.books), `theme:${theme.key}`) : h('p', { class: 'muted small' }, 'Tap a theme to see its books.'),
      ] : h('p', { class: 'muted' }, 'Themes come from each book’s Open Library subjects, which are looked up in the background.'),
      workerProgress(state, now(), { compact: true })),

    h('section', { class: 'card authors' },
      h('h2', {}, 'Most-read authors'),
      as.length ? [
        barList({ cls: 'author-bars', data: as, selected: e.author, onSelect: (k) => actions.setExplore({ author: e.author === k ? null : k }) }),
        author ? bookList(ctx, byYear(author.books), `author:${author.key}`) : null,
      ] : h('p', { class: 'muted' }, 'No author with more than one book yet.')));
}
