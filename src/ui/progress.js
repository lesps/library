// How far the background look-ups (details, covers, page counts, subjects) have got, and roughly
// how long is left: measured from this run once a few books are done, else about 1.2 s a book
// (Open Library is asked about once a second).
import { h, plural } from './dom.js';

export const BOOK_MS = 1200;

export function workerProgress(state, now, { compact = false } = {}) {
  const w = state.workers;
  if (!(w.remaining > 0)) return null;
  const total = w.done + w.remaining;
  let left;
  if (!state.online) left = 'Continues when you’re back online.';
  else if (now < w.pausedUntil) left = 'Paused for a few minutes: Open Library asked Catalog to slow down.';
  else {
    const per = w.runDone >= 5 && now > w.startedAt ? (now - w.startedAt) / w.runDone : BOOK_MS;
    const ms = w.remaining * per;
    left = ms < 60_000 ? 'less than a minute left' : `about ${Math.round(ms / 60_000)} min left`;
  }
  return h('div', { class: `work-progress${compact ? ' compact' : ''}`, role: 'status' },
    h('div', { class: 'wp-text' },
      h('span', { class: 'wp-label' }, 'Filling in covers and details'),
      h('span', { class: 'wp-count' }, `${w.done} of ${plural(total, 'book')} · ${left}`)),
    h('div', { class: 'wp-track', role: 'progressbar', 'aria-label': 'Covers and details filled in', 'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': String(w.done) },
      h('span', { class: 'wp-fill', style: { width: `${total ? (100 * w.done) / total : 0}%` } })),
    compact ? null : h('p', { class: 'wp-note' }, 'Runs while Catalog is open.'));
}
