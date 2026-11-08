import { h, plural } from '../dom.js';
import { ICONS } from '../icons.js';
import { coverEl, displayTitle } from '../cover.js';
import { mascot } from '../cat-layer.js';
import { showIosHelp } from '../install.js';
import { formatDate, dayKey } from '../../lib/dates.js';
import { needsCover } from '../../lib/lookup.js';

const when = (ts, now) => `${formatDate(dayKey(ts), now)} at ${new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
const REASONS = { daily: 'Daily copy', import: 'Before an import', delete: 'Before a delete', restore: 'Before a restore', merge: 'Before merging a backup', manual: 'Saved by hand', dismissed: 'Before clearing Not interested' };

const row = (label, detail, onclick, cls = '') => h('button', { type: 'button', class: `row ${cls}`.trim(), onclick },
  h('span', { class: 'row-text' }, h('span', { class: 'row-label' }, label), detail ? h('span', { class: 'row-detail' }, detail) : null),
  h('span', { class: 'chev', html: ICONS.back }));

export function settingsView({ state, actions, env, now }) {
  const t = now();
  const live = state.data.books.filter((b) => !b.deleted);
  const deleted = state.data.books.filter((b) => b.deleted).length;
  const dismissed = state.data.swipes.filter((x) => !x.deleted && x.verdict === 'no').length;
  const missingCovers = live.filter((b) => needsCover(b, t)).length;
  const last = state.meta.lastExport;
  return h('section', { class: 'settings-view' },
    h('header', { class: 'top' }, h('h1', {}, 'Settings')),
    state.storageKind === 'memory' ? h('p', { class: 'note warn storage-warning' }, 'This browser won’t let Catalog store anything (private browsing?). Your changes last only until you close the page. Export a backup before leaving.') : null,

    h('section', { class: 'card' },
      h('h2', {}, 'Backup'),
      h('p', { class: 'muted' }, last ? `Last backup file: ${when(last, t)}.` : 'No backup file yet. Your library lives only on this device until you save one.'),
      h('div', { class: 'card-actions' },
        h('button', { type: 'button', class: 'btn primary export-backup', onclick: () => actions.exportBackup() }, 'Save backup file'),
        h('label', { class: 'btn file-btn' }, 'Merge a backup…',
          h('input', { type: 'file', class: 'import-backup', accept: '.json,application/json', onchange: (e) => { const f = e.target.files?.[0]; if (f) actions.importBackupFile(f); e.target.value = ''; } }))),
      h('p', { class: 'muted small' }, 'Save it to iCloud Drive or another folder that leaves this device. Merging keeps the newer of each change, so it’s safe to merge a backup from another device.')),

    h('section', { class: 'card rows' },
      row('Safety copies', 'Daily copies kept on this device', () => actions.go('/snapshots')),
      row('Recently deleted', deleted ? plural(deleted, 'book') : 'Nothing', () => actions.go('/deleted')),
      row('Not interested', dismissed ? plural(dismissed, 'book') : 'Nothing', () => actions.go('/dismissed'))),

    h('section', { class: 'card' },
      h('h2', {}, 'Goodreads'),
      h('div', { class: 'card-actions' },
        h('button', { type: 'button', class: 'btn', onclick: () => actions.go('/import') }, 'Import from Goodreads'),
        h('button', { type: 'button', class: 'btn export-goodreads', onclick: () => actions.exportGoodreads() }, 'Export Goodreads CSV')),
      h('p', { class: 'muted small' }, 'The CSV uses Goodreads’ own columns, so Goodreads, StoryGraph and others can import it.')),

    h('section', { class: 'card' },
      h('h2', {}, 'Cats'),
      h('div', { class: 'radios', role: 'radiogroup', 'aria-label': 'Background cats' },
        [['lively', 'Lively'], ['subtle', 'A few'], ['off', 'None']].map(([v, label]) => h('label', { class: 'radio' },
          h('input', { type: 'radio', name: 'cats', value: v, checked: state.data.settings.cats === v, onchange: () => actions.setCats(v) }), label))),
      h('p', { class: 'muted small' }, 'Background cats change every time you change pages.')),

    h('section', { class: 'card' },
      h('h2', {}, 'Covers'),
      h('p', { class: 'muted' }, missingCovers ? `${plural(missingCovers, 'book')} without a cover yet. ${state.online ? 'They’re fetched in the background, about one a second.' : 'They’ll be fetched when you’re online.'}` : 'Every book has a cover, or none could be found.'),
      missingCovers && state.online ? h('button', { type: 'button', class: 'btn small', onclick: () => actions.runWorkers() }, 'Fetch now') : null),

    h('section', { class: 'card' },
      h('h2', {}, 'This app'),
      h('p', { class: 'muted' }, state.persisted === false
        ? 'The browser may clear Catalog’s storage if the device runs low on space. Installing it to your Home Screen helps.'
        : 'Everything is stored on this device and works offline.'),
      state.updateReady ? h('div', { class: 'update-ready' }, h('p', {}, 'An update is ready.'), h('button', { type: 'button', class: 'btn primary restart', onclick: () => actions.applyUpdate() }, 'Restart now')) : null,
      h('div', { class: 'card-actions' },
        h('button', { type: 'button', class: 'btn whats-new', onclick: () => actions.showWhatsNew() }, 'What’s new'),
        env.ios && !env.standalone ? h('button', { type: 'button', class: 'btn', onclick: () => showIosHelp() }, 'Install on iPhone') : null),
      h('p', { class: 'muted small' }, 'Book data from Open Library and Google Books.')));
}

export function snapshotsView({ state, actions, now }) {
  const list = state.snapshots;
  return h('section', { class: 'snapshots-view' },
    h('div', { class: 'detail-top' }, h('button', { type: 'button', class: 'icon-btn back', 'aria-label': 'Back', html: ICONS.back, onclick: () => actions.go('/settings') })),
    h('h1', {}, 'Safety copies'),
    h('p', { class: 'muted' }, 'Kept on this device: one a day for a week, one a week for a month, plus a copy before every import, delete, restore or merge. They can’t help if the device itself is lost; a backup file can.'),
    h('button', { type: 'button', class: 'btn small', onclick: () => actions.snapshotNow() }, 'Save a copy now'),
    list == null ? h('p', {}, 'Loading…') : !list.length ? h('div', { class: 'empty' }, mascot('safe'), h('p', {}, 'No copies yet. The first one is saved once your library has books in it.')) :
      h('ul', { class: 'snapshots' }, list.map((s) => h('li', { class: 'snap' },
        h('div', {}, h('span', { class: 'snap-when' }, when(s.at, now())), h('span', { class: 'snap-why' }, `${REASONS[s.reason] ?? s.reason} · ${plural(s.counts?.books ?? 0, 'book')}`)),
        h('button', { type: 'button', class: 'btn small restore', onclick: () => actions.restoreSnapshot(s.id) }, 'Restore')))));
}

export function deletedView({ state, actions }) {
  const gone = state.data.books.filter((b) => b.deleted).sort((a, b) => b.updatedAt - a.updatedAt);
  return h('section', { class: 'deleted-view' },
    h('div', { class: 'detail-top' }, h('button', { type: 'button', class: 'icon-btn back', 'aria-label': 'Back', html: ICONS.back, onclick: () => actions.go('/settings') })),
    h('h1', {}, 'Recently deleted'),
    gone.length > 1 ? h('button', { type: 'button', class: 'btn small', onclick: () => actions.restoreBooks(gone.map((b) => b.id)) }, `Restore all ${gone.length}`) : null,
    gone.length ? h('ul', { class: 'deleted' }, gone.slice(0, 300).map((b) => h('li', { class: 'deleted-book' },
      coverEl(b, { size: 'S', cls: 'thumb' }),
      h('span', { class: 'db-text' }, h('span', { class: 'db-title' }, displayTitle(b)), h('span', { class: 'db-author' }, b.authors.join(', '))),
      h('button', { type: 'button', class: 'btn small restore-book', onclick: () => actions.restoreBooks([b.id]) }, 'Restore'))))
      : h('div', { class: 'empty' }, mascot('done'), h('p', {}, 'Nothing deleted.')));
}

// Books passed on in Discover: hidden for a year, counting for less as they age (taste.js).
export function dismissedView({ state, actions, now }) {
  const list = state.data.swipes.filter((s) => !s.deleted && s.verdict === 'no').sort((a, b) => b.at - a.at);
  return h('section', { class: 'dismissed-view' },
    h('div', { class: 'detail-top' }, h('button', { type: 'button', class: 'icon-btn back', 'aria-label': 'Back', html: ICONS.back, onclick: () => actions.go('/settings') })),
    h('h1', {}, 'Not interested'),
    h('p', { class: 'muted' }, 'Books you passed on in Discover. Each stays hidden for a year and counts for less as it ages. Restore one to let it turn up again.'),
    list.length ? h('button', { type: 'button', class: 'btn small danger clear-dismissed', onclick: () => actions.clearDismissed() }, `Clear all ${list.length}`) : null,
    list.length ? h('ul', { class: 'deleted dismissed' }, list.slice(0, 500).map((s) => h('li', { class: 'deleted-book dismissed-item' },
      h('span', { class: 'db-text' }, h('span', { class: 'db-title di-title' }, s.title || 'Untitled'),
        h('span', { class: 'db-author' }, [s.authors.join(', '), `passed on ${formatDate(dayKey(s.at), now())}`].filter(Boolean).join(' · '))),
      h('button', { type: 'button', class: 'btn small restore', onclick: () => actions.restoreSwipe(s.id) }, 'Restore'))))
      : h('div', { class: 'empty' }, mascot('done'), h('p', {}, 'Nothing here. Books you pass on in Discover show up here.')));
}
