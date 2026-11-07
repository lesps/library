// The year's reading goal: books and pages read against the goal, with where an even pace would be
// today. Shared by the Reading tab (compact, links to stats) and the stats page.
import { h, formDialog, plural } from '../dom.js';
import { mascot } from '../cat-layer.js';
import { yearStats, pace, dayOfYear, daysInYear } from '../../lib/stats.js';

const fmt = (n) => n.toLocaleString('en-US');

// "about one every 3 days", "about 2 a day", "about one a week"
export function rate(p, unit) {
  if (!p || !p.toGo || !p.daysLeft) return '';
  if (p.perDay >= 1 || unit === 'pages') return `about ${fmt(Math.ceil(p.toGo / p.daysLeft))} a day`;
  const every = p.daysLeft / p.toGo;
  if (every < 10) return `about one every ${Math.max(2, Math.round(every))} days`;
  const weeks = Math.round(every / 7);
  return weeks <= 1 ? 'about one a week' : `about one every ${weeks} weeks`;
}

export function paceText(p, unit) {
  const u = (n) => (unit === 'books' ? plural(n, 'book') : `${fmt(n)} pages`);
  switch (p.status) {
    case 'done': return p.by ? `Goal reached, and ${u(p.by)} over.` : 'Goal reached.';
    case 'missed': return `Missed by ${u(p.by)}.`;
    case 'upcoming': return 'Starts January 1.';
    case 'ahead': return `${u(p.by)} ahead of pace · ${fmt(p.toGo)} to go, ${rate(p, unit)}.`;
    case 'behind': return `${u(p.by)} behind pace · ${fmt(p.toGo)} to go, ${rate(p, unit)}.`;
    default: return `On pace · ${fmt(p.toGo)} to go, ${rate(p, unit)}.`;
  }
}

function meter({ cls, figure, done, goal, mark, label }) {
  return h('div', { class: cls },
    h('p', { class: 'goal-figure' }, figure),
    h('div', { class: 'meter', role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': String(goal), 'aria-valuenow': String(done), 'aria-label': label },
      h('span', { class: 'meter-fill', style: { width: `${Math.min(100, (done / goal) * 100)}%` } }),
      mark != null ? h('span', { class: 'meter-pace', title: 'Where an even pace would be today', style: { left: `${mark * 100}%` } }) : null));
}

export function editGoal(actions, year, goal) {
  formDialog({
    title: `${year} reading goal`,
    fields: [
      { name: 'books', label: 'Books', value: goal?.books ?? '', inputmode: 'numeric' },
      { name: 'pages', label: 'Pages', value: goal?.pages ?? '', inputmode: 'numeric', hint: 'Optional. Leave both empty to remove the goal.' },
    ],
    onSubmit: (v) => { actions.setGoal(year, v); },
  });
}

export function goalCard(ctx, year, { compact = false } = {}) {
  const { state, actions, now } = ctx;
  const goal = state.data.settings.goals?.[year] ?? null;
  const s = yearStats(state.data.books, state.data.reads, year);
  const t = now();
  const current = new Date(t).getFullYear();
  const mark = year === current ? (dayOfYear(t) - 0.5) / daysInYear(year) : null;
  const seeStats = compact ? h('button', { type: 'button', class: 'link see-stats', onclick: () => actions.go('/stats') }, 'See reading stats') : null;

  if (!goal) {
    const verb = year < current ? 'You finished' : year > current ? 'Nothing finished in' : 'You’ve finished';
    return h('section', { class: 'goal-card card' },
      h('h2', {}, year === current ? `${year} so far` : String(year)),
      h('p', {}, year > current ? `${verb} ${year} yet.` : `${verb} ${plural(s.count, 'book')} (${fmt(s.pages)} pages) in ${year}${s.rereads ? `, ${plural(s.rereads, 'reread')} among them` : ''}.`),
      h('div', { class: 'card-actions' },
        h('button', { type: 'button', class: 'btn small primary set-goal', onclick: () => editGoal(actions, year, null) }, year < current ? 'Add the goal you had' : 'Set a goal'),
        seeStats));
  }

  const books = goal.books ? pace({ goal: goal.books, done: s.count, year, now: t }) : null;
  const pages = goal.pages ? pace({ goal: goal.pages, done: s.pages, year, now: t }) : null;
  const headline = books ?? pages;
  return h('section', { class: `goal-card card${headline.status === 'done' ? ' reached' : ''}` },
    h('div', { class: 'card-head' },
      h('h2', {}, `${year} reading goal`),
      h('button', { type: 'button', class: 'link edit-goal', onclick: () => editGoal(actions, year, goal) }, 'Edit')),
    headline.status === 'done' ? mascot('done', 'small goal-cat') : null,
    books ? meter({ cls: 'goal-books', figure: `${fmt(s.count)} of ${plural(goal.books, 'book')}`, done: s.count, goal: goal.books, mark, label: `${s.count} of ${goal.books} books` }) : null,
    pages ? meter({ cls: 'goal-pages', figure: `${fmt(s.pages)} of ${fmt(goal.pages)} pages`, done: s.pages, goal: goal.pages, mark, label: `${s.pages} of ${goal.pages} pages` }) : null,
    h('p', { class: 'pace' }, paceText(headline, books ? 'books' : 'pages')),
    books && pages && pages.status !== 'done' && pages.status !== 'missed' && pages.status !== 'upcoming'
      ? h('p', { class: 'pace pages-pace muted' }, `Pages: ${fmt(pages.toGo)} to go, ${rate(pages, 'pages')}.`) : null,
    s.unknownPages && goal.pages ? h('p', { class: 'muted small' }, `${plural(s.unknownPages, 'book')} without a page count ${s.unknownPages === 1 ? 'isn’t' : 'aren’t'} in the page total.`) : null,
    seeStats);
}
