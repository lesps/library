// Reading stats by year: the goal, totals, books by month, the year's books, and every year since
// the first dated read (imports included).
import { h, plural } from '../dom.js';
import { ICONS } from '../icons.js';
import { coverEl, displayTitle } from '../cover.js';
import { columnChart } from '../charts.js';
import { paws } from './library.js';
import { goalCard } from './goal.js';
import { yearStats, yearsSummary, undatedReads } from '../../lib/stats.js';
import { formatDate } from '../../lib/dates.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const fmt = (n) => n.toLocaleString('en-US');
const SHOW = 10; // books listed before "Show all"
const books = (n) => (n ? plural(n, 'book') : 'no books');

const kpi = (label, value) => h('div', { class: 'kpi' }, h('span', { class: 'kpi-label' }, label), h('span', { class: 'kpi-value' }, value));

// sub replaces the author line (the extremes show page counts there).
function bookLine(actions, b, extra, sub = b.authors.join(', ')) {
  return h('li', {},
    h('button', { type: 'button', class: 'fl-book', onclick: () => actions.go(`/book/${b.id}`) },
      coverEl(b, { size: 'S', cls: 'thumb' }),
      h('span', { class: 'fl-text' },
        h('span', { class: 'fl-title' }, displayTitle(b)),
        h('span', { class: 'fl-author' }, sub)),
      extra));
}

export function statsView(ctx) {
  const { state, actions, now } = ctx;
  const current = new Date(now()).getFullYear();
  const goals = state.data.settings.goals ?? {};
  const history = yearsSummary(state.data.books, current);
  const year = state.statsYear ?? current;
  const s = yearStats(state.data.books, year);
  const chips = history.filter((y) => y.count || y.year === current || goals[y.year] || y.year === year).map((y) => y.year).reverse();
  const pick = (y) => actions.setStatsYear(y);
  const undated = undatedReads(state.data.books);

  return h('section', { class: 'stats-view' },
    h('div', { class: 'detail-top' }, h('button', { type: 'button', class: 'icon-btn back', 'aria-label': 'Back', html: ICONS.back, onclick: () => actions.go('/reading') })),
    h('h1', {}, 'Reading stats'),
    h('div', { class: 'chips year-chips', role: 'group', 'aria-label': 'Year' },
      chips.map((y) => h('button', { type: 'button', 'aria-pressed': String(y === year), onclick: () => pick(y) }, String(y)))),

    goalCard(ctx, year),

    h('div', { class: 'kpis' },
      kpi('Books', fmt(s.count)),
      kpi('Pages', fmt(s.pages)),
      kpi('Average rating', s.avgRating == null ? '–' : String(s.avgRating)),
      kpi('Average length', s.avgPages == null ? '–' : `${fmt(s.avgPages)} pages`)),

    columnChart({
      cls: 'by-month card',
      caption: `Books finished each month, ${year}`,
      data: s.byMonth.map((m) => ({
        key: m.month,
        axis: MONTHS[m.month][0],
        value: m.count,
        label: `${MONTHS[m.month]} ${year}: ${m.count ? `${books(m.count)}, ${fmt(m.pages)} pages` : 'no books'}`,
        tip: `${MONTHS[m.month].slice(0, 3)}: ${books(m.count)}${m.pages ? ` · ${fmt(m.pages)} pages` : ''}`,
      })),
    }),

    history.length > 1 ? columnChart({
      cls: 'by-year card',
      caption: 'Books finished each year',
      selected: year,
      onSelect: pick,
      data: history.map((y) => ({
        key: y.year,
        axis: history.length > 8 ? `’${String(y.year).slice(2)}` : String(y.year),
        value: y.count,
        label: `${y.year}: ${books(y.count)}${y.count ? `, ${fmt(y.pages)} pages` : ''}`,
        tip: `${y.year}: ${books(y.count)}${y.pages ? ` · ${fmt(y.pages)} pages` : ''}`,
      })),
    }) : null,

    s.longest && s.count > 1 ? h('div', { class: 'extremes' },
      h('div', { class: 'card' }, h('p', { class: 'kpi-label' }, 'Longest'), h('ul', { class: 'finished-mini' }, bookLine(actions, s.longest, null, `${fmt(s.longest.pages)} pages`))),
      h('div', { class: 'card' }, h('p', { class: 'kpi-label' }, 'Shortest'), h('ul', { class: 'finished-mini' }, bookLine(actions, s.shortest, null, `${fmt(s.shortest.pages)} pages`)))) : null,

    h('section', { class: 'card' },
      h('h2', {}, `Finished in ${year}`),
      s.count ? h('ol', { class: 'finished-list' }, s.books.slice(0, state.statsShowAll ? Infinity : SHOW).map((b) => bookLine(actions, b,
        h('span', { class: 'fl-meta' }, h('span', { class: 'fl-date' }, formatDate(b.finished, now())), paws(b.rating, 'small')))))
        : h('p', { class: 'muted' }, year > current ? 'This year hasn’t started.' : 'No books with a finish date in this year.'),
      s.count > SHOW && !state.statsShowAll ? h('button', { type: 'button', class: 'btn small show-all', onclick: () => actions.showAllFinished() }, `Show all ${s.count}`) : null,
      s.unknownPages ? h('p', { class: 'muted small' }, `${plural(s.unknownPages, 'book')} here ${s.unknownPages === 1 ? 'has' : 'have'} no page count, so ${s.unknownPages === 1 ? 'it isn’t' : 'they aren’t'} in the page total. “Fill in from the web” on the book’s page can find it.`) : null),


    undated.length ? h('details', { class: 'undated card' },
      h('summary', {}, `${plural(undated.length, 'read book')} ${undated.length === 1 ? 'has' : 'have'} no finish date, so ${undated.length === 1 ? 'it isn’t' : 'they aren’t'} counted in any year`),
      h('p', { class: 'muted small' }, 'Open one and set its Finished date to count it.'),
      h('ul', { class: 'finished-mini' }, undated.slice(0, 200).map((b) => h('li', {},
        h('button', { type: 'button', class: 'fl-book ud-book', onclick: () => actions.go(`/book/${b.id}`) },
          coverEl(b, { size: 'S', cls: 'thumb' }),
          h('span', { class: 'fl-text' }, h('span', { class: 'fl-title' }, displayTitle(b)), h('span', { class: 'fl-author' }, b.authors.join(', '))))))))
      : null);
}
