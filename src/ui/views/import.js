import { h, plural } from '../dom.js';
import { ICONS } from '../icons.js';
import { mascot } from '../cat-layer.js';

const steps = () => h('ol', { class: 'how' },
  h('li', {}, 'On a computer, sign in at goodreads.com and open My Books.'),
  h('li', {}, 'Under Tools, choose Import and export, then Export Library. A download link appears when the file is ready.'),
  h('li', {}, 'Open that file here. On iPhone, save it to Files or AirDrop it first.'));

function picker({ actions }, again) {
  return h('label', { class: `btn file-btn${again ? '' : ' primary'}` }, again ? 'Choose another file' : 'Choose export file',
    h('input', { type: 'file', class: 'gr-file', accept: '.csv,text/csv', onchange: (e) => { const f = e.target.files?.[0]; if (f) actions.importFile(f); } }));
}

export function importView(ctx) {
  const { state, actions, env } = ctx;
  const imp = state.imp;
  const head = h('div', { class: 'detail-top' }, h('button', { type: 'button', class: 'icon-btn back', 'aria-label': 'Back', html: ICONS.back, onclick: () => actions.back() }));
  const iosWarning = env.ios && !env.standalone
    ? h('p', { class: 'note warn' }, 'Install Catalog on your Home Screen before importing. On iPhone the installed app keeps its own library, separate from Safari.')
    : null;
  let body;
  switch (imp.phase) {
    case 'reading':
    case 'importing':
      body = h('div', { class: 'import-busy' }, mascot('busy', 'big'), h('p', {}, imp.phase === 'reading' ? 'Reading your export…' : 'Shelving your books…'));
      break;
    case 'error':
      body = h('div', {}, h('p', { class: 'import-error error' }, imp.error), picker(ctx, true));
      break;
    case 'preview': {
      const c = imp.plan.counts;
      const nothing = !c.add && !c.update && !c.notes && !c.collections;
      body = h('div', { class: 'import-preview card' },
        h('h2', {}, imp.fileName),
        nothing ? h('p', {}, `Nothing new to import: all ${plural(imp.rows.length, 'book')} are already in your library.`) : h('ul', { class: 'counts' },
          c.add ? h('li', {}, plural(c.add, 'new book')) : null,
          c.update ? h('li', {}, `${plural(c.update, 'book')} already here, updated from Goodreads`) : null,
          c.unchanged ? h('li', {}, `${plural(c.unchanged, 'book')} already here, unchanged`) : null,
          c.collections ? h('li', {}, `${plural(c.collections, 'new collection')}: ${imp.plan.collections.map((x) => x.name).join(', ')}`) : null,
          c.notes ? h('li', {}, `${plural(c.notes, 'private note')} kept as notes`) : null,
          imp.skipped ? h('li', { class: 'muted' }, `${plural(imp.skipped, 'empty row')} skipped`) : null),
        h('label', { class: 'check' },
          h('input', { type: 'checkbox', class: 'update-existing', checked: imp.updateExisting, onchange: (e) => actions.setImportUpdate(e.target.checked) }),
          'Update books I already have (status, rating, dates, review)'),
        h('p', { class: 'muted' }, 'A safety copy of your library is saved first, so an import can always be undone from Settings → Safety copies.'),
        nothing ? null : h('button', { type: 'button', class: 'btn primary do-import', onclick: () => actions.confirmImport() },
          c.add ? `Import ${plural(c.add, 'book')}` : 'Import'),
        picker(ctx, true));
      break;
    }
    case 'done': {
      const c = imp.counts;
      body = h('div', { class: 'import-done' }, mascot('done', 'big'),
        h('h2', {}, `Imported ${plural(c.add, 'book')}${c.update ? `, updated ${c.update}` : ''}.`),
        h('p', {}, state.online ? 'Covers will fill in over the next few minutes while you’re online.' : 'Covers will fill in when you’re next online.'),
        h('button', { type: 'button', class: 'btn primary', onclick: () => actions.go('/library') }, 'See your library'),
        h('button', { type: 'button', class: 'btn ghost', onclick: () => actions.go('/import') }, 'Import another file'));
      break;
    }
    default:
      body = h('div', {}, steps(), picker(ctx, false));
  }
  return h('section', { class: 'import-view' }, head, h('h1', {}, 'Import from Goodreads'), iosWarning, body);
}
