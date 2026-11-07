// The Reading tab: what you're reading now, this year's goal, and what's up next.
import { h } from '../dom.js';
import { coverEl, displayTitle } from '../cover.js';
import { currentProgress, progressPercent } from '../../lib/records.js';
import { goalCard } from './goal.js';
import { queueSection } from './queue.js';

function nowReading({ state, actions }) {
  const reading = state.data.books.filter((b) => !b.deleted && b.status === 'reading').sort((a, b) => b.fieldAt.status - a.fieldAt.status);
  if (!reading.length) return null;
  return h('section', { class: 'now-reading' },
    h('h2', {}, 'Reading now'),
    h('div', { class: 'nr-row' }, reading.map((b) => {
      const pct = progressPercent(currentProgress(state.data.progress.filter((p) => p.bookId === b.id)), b.pages);
      return h('button', { type: 'button', class: 'nr-book', onclick: () => actions.go(`/book/${b.id}`) },
        coverEl(b, { size: 'M', cls: 'nr-cover' }),
        h('span', { class: 'nr-title' }, displayTitle(b)),
        h('span', { class: 'nr-progress' },
          h('span', { class: 'nr-bar', 'aria-hidden': 'true' }, h('span', { style: { width: `${pct ?? 0}%` } })),
          h('span', { class: 'nr-pct' }, pct == null ? '' : `${pct}%`)));
    })));
}

export function readingView(ctx) {
  const year = new Date(ctx.now()).getFullYear();
  return h('section', { class: 'reading-view' },
    h('header', { class: 'top' }, h('h1', {}, 'Reading')),
    nowReading(ctx),
    goalCard(ctx, year, { compact: true }),
    queueSection(ctx));
}
