// The app: state, routing, persistence and every action the views call.
//
// Memory holds the working copy (state.data); the store is the durable copy. Every change goes
// through edit(): apply in memory, render, then write the changed records in one transaction.
// Writes are serialized; a failed write is kept and retried, with a warning on screen until it lands.
import { h, sheet, confirmDialog, promptDialog, plural } from './dom.js';
import { toast } from './toast.js';
import { ICONS } from './icons.js';
import { createCatLayer } from './cat-layer.js';
import { createNet, OfflineError, HttpError } from './net.js';
import { saveFile as defaultSaveFile } from './files.js';
import { detectEnv } from './install.js';
import { showWhatsNew } from './whats-new.js';
import { openStore, createMemoryStore } from '../db/store.js';
import { emptyData, mergeData, KINDS } from '../lib/merge.js';
import { applyEdits, restoreEdits, snapshotsToKeep, snapshotDue, dataVersion } from '../lib/snapshots.js';
import { captureBefore, undoEdits } from '../lib/undo.js';
import { createBook, updateBook, STATUS_LABELS } from '../lib/book.js';
import { statusChange, createRead, sanitizeRead, reconcileReads } from '../lib/reads.js';
import { createNote, createProgress, createCollection, sanitizeNote, touch, findCollection, createSwipe } from '../lib/records.js';
import { toReadQueue, queueEndRank, findDuplicate } from '../lib/library.js';
import { rankBetween, spreadRanks } from '../lib/rank.js';
import { dayKey } from '../lib/dates.js';
import { exportData, backupFilename, parseBackup, backupDue } from '../lib/backup.js';
import { parseGoodreads, planImport, goodreadsCsv } from '../lib/goodreads.js';
import { olSearchUrl, parseOlSearch, googleSearchUrl, parseGoogle, coverLookupUrl, parseBookLookup, needsCover, needsSubjects, coverSrc } from '../lib/lookup.js';
import { isbnFromQuery } from '../lib/isbn.js';
import { parseChangelog, notesSince, releasesUpTo } from '../lib/changelog.js';
import { libraryView } from './views/library.js';
import { bookView } from './views/book.js';
import { readingView } from './views/reading.js';
import { statsView } from './views/stats.js';
import { sanitizeGoals } from '../lib/settings.js';
import { addView } from './views/add.js';
import { collectionsView } from './views/collections.js';
import { seriesView } from './views/series.js';
import { seriesKey, seriesList, seriesLabel, booksInSeries, wdFindSeriesUrl, parseFoundSeries, pickSeries, wdMembersUrl, parseMembers, matchMember } from '../lib/series.js';
import { settingsView, snapshotsView, deletedView, dismissedView } from './views/settings.js';
import { discoverView, lanesView } from './views/discover.js';
import { findLanes, vectorize, featuresFromKeys, blend } from '../lib/taste.js';
import { laneQueries, wildcardQuery, searchUrl, workUrl, nextQuery, parseDeal, parseWorkDescription, rankPool, deal, stillFresh, cardToBook, DEAL_SIZE, DECK_LOW, PAGE_SIZE, WILDCARD } from '../lib/discover.js';
import { rng } from '../lib/cats.js';
import { importView } from './views/import.js';
import { VERSION, CHANGELOG } from '../version.js';

export const TABS = [
  { view: 'library', label: 'Library', icon: 'library' },
  { view: 'reading', label: 'Reading', icon: 'queue' },
  { view: 'add', label: 'Add', icon: 'add' },
  { view: 'collections', label: 'Collections', icon: 'collections' },
  { view: 'settings', label: 'Settings', icon: 'settings' },
];
const VIEWS = { library: libraryView, book: bookView, reading: readingView, stats: statsView, add: addView, collections: collectionsView, series: seriesView, discover: discoverView, lanes: lanesView, dismissed: dismissedView, settings: settingsView, import: importView, snapshots: snapshotsView, deleted: deletedView };
const PREF_KEYS = ['layout', 'sort', 'status', 'collection'];
const DAY = 86_400_000;
const RETRY_MS = 15_000;

export function parseRoute(hash) {
  const [view, id] = String(hash ?? '').replace(/^#?\/?/, '').split('/');
  return view in VIEWS ? { view, id: id ? decodeURIComponent(id) : null } : { view: 'library', id: null };
}
const routePath = (r) => `/${r.view}${r.id ? `/${encodeURIComponent(r.id)}` : ''}`;

const mergeChanges = (a, b) => {
  if (!a) return b;
  if (!b) return a;
  const out = { meta: { ...a.meta, ...b.meta }, settings: b.settings ?? a.settings };
  for (const k of ['books', ...KINDS]) {
    const byId = new Map((a[k] ?? []).map((r) => [r.id, r]));
    for (const r of b[k] ?? []) byId.set(r.id, r);
    out[k] = [...byId.values()];
  }
  return out;
};

export function mountApp(root, opts = {}) {
  const win = opts.win ?? window;
  const now = opts.now ?? Date.now;
  const saveFile = opts.saveFile ?? defaultSaveFile;
  const env = opts.env ?? detectEnv(win);
  const version = opts.version ?? VERSION;
  const changelog = opts.changelog ?? CHANGELOG;
  const isOnline = opts.isOnline ?? (() => win.navigator.onLine !== false);
  const catSeed = opts.catSeed ?? (() => Math.floor(Math.random() * 2 ** 32));
  const net = createNet({ fetch: opts.fetch ?? win.fetch?.bind(win), delay: opts.delay, now });
  const channel = opts.channel !== undefined ? opts.channel : (typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('catalog') : null);
  const workersOn = opts.workers ?? true;
  const openScanner = opts.openScanner ?? ((o) => import('./scanner.js').then((m) => m.openScanner(o)));
  const today = () => dayKey(now());

  let store = opts.store ?? null;
  const state = {
    loading: true,
    data: emptyData(),
    meta: {},
    route: parseRoute(win.location.hash),
    library: { status: 'all', collection: 'all', query: '', sort: 'added', layout: 'grid' },
    selection: null,
    online: isOnline(),
    saveError: null,
    storageKind: 'indexeddb',
    persisted: null,
    updateReady: null,
    reloadNeeded: false,
    add: { query: '', status: 'want', phase: 'idle', results: [], paste: null },
    imp: { phase: 'pick' },
    snapshots: null,
    series: new Map(), // series key → { phase, id (Wikidata), members, picked }: looking up the rest
    // Discover: the deck (saved on the device), paging state per search, candidate pools per lane
    // (memory only), the card turned over for details, and the cards looked at this session.
    discover: { deck: [], cursors: {}, exhausted: [], pools: new Map(), dealing: false, details: null, peeked: new Set(), thin: [], error: '' },
    statsYear: null,
    statsShowAll: false,
    workers: { remaining: 0, running: false, pausedUntil: 0 },
  };

  // ——— shell ———
  const main = h('main', { class: 'view', id: 'main' });
  const tabs = h('nav', { class: 'tabs', 'aria-label': 'Sections' }, TABS.map((t) => h('button', {
    type: 'button', 'data-view': t.view, class: t.view === 'add' ? 'tab-add' : '',
    onclick: () => go(`/${t.view}`, { tab: true }),
  }, h('span', { class: 'tab-icon', html: ICONS[t.icon] }), h('span', { class: 'tab-label' }, t.label))));
  root.replaceChildren(main, tabs);
  const cats = createCatLayer(win.document);
  const ac = new AbortController();
  const listen = (target, type, fn) => target.addEventListener(type, fn, { signal: ac.signal });

  // ——— rendering ———
  let destroyed = false;
  let lastKey = null;
  let lastCats = null;
  let renderAbort = null;
  let backTo = '/library';
  let seriesBack = '/collections'; // where a series page's Back goes: often the book it was opened from
  const scrollMemory = new Map();
  const routeKey = () => routePath(state.route);

  function banners() {
    const out = [];
    if (state.saveError) {
      out.push(h('div', { class: 'banner save-error', role: 'alert' },
        h('p', {}, h('strong', {}, 'Changes are not being saved on this device. '), state.saveError, ' Export a backup to keep them safe.'),
        h('button', { type: 'button', class: 'btn small', onclick: () => drain() }, 'Try again'),
        h('button', { type: 'button', class: 'btn small export-backup', onclick: () => actions.exportBackup() }, 'Export backup')));
    }
    if (state.reloadNeeded) {
      out.push(h('div', { class: 'banner', role: 'alert' }, h('p', {}, 'Catalog was updated in another tab.'),
        h('button', { type: 'button', class: 'btn small', onclick: () => win.location.reload() }, 'Reload')));
    }
    return out;
  }

  function render() {
    if (destroyed) return;
    const key = routeKey();
    const sameRoute = key === lastKey;
    if (sameRoute) scrollMemory.set(key, win.scrollY);
    const active = win.document.activeElement;
    const focusKey = active?.dataset?.focus;
    const caret = focusKey && 'selectionStart' in active ? [active.selectionStart, active.selectionEnd] : null;

    renderAbort?.abort();
    renderAbort = new AbortController();
    const after = [];
    const ctx = { state, actions, now, today, env, signal: renderAbort.signal, afterRender: (fn) => after.push(fn) };
    const view = state.loading ? h('div', { class: 'loading' }, 'Opening your library…') : VIEWS[state.route.view](ctx);
    main.dataset.view = state.route.view;
    main.replaceChildren(...banners(), view);
    const tab = { book: 'library', import: 'library', stats: 'reading', series: 'collections', discover: 'add', lanes: 'add', snapshots: 'settings', deleted: 'settings', dismissed: 'settings' }[state.route.view] ?? state.route.view;
    for (const b of tabs.children) {
      if (b.dataset.view === tab) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    }
    if (focusKey) {
      const el = main.querySelector(`[data-focus="${focusKey}"]`);
      if (el) {
        el.focus();
        if (caret) try { el.setSelectionRange(...caret); } catch { /* not a text field */ }
      }
    }
    const y = sameRoute ? scrollMemory.get(key) : (scrollMemory.get(key) ?? 0);
    if (win.scrollY !== y) try { win.scrollTo(0, y); } catch { /* jsdom */ }
    for (const fn of after) fn();
    const catKey = `${key}|${state.data.settings.cats}`;
    if (!sameRoute || catKey !== lastCats) {
      cats.shuffle(state.data.settings.cats, catSeed());
      lastCats = catKey;
    }
    lastKey = key;
  }

  function go(path, { tab = false, replace = false } = {}) {
    const route = parseRoute(path);
    const from = routeKey();
    if (route.view === 'import' && ['done', 'error'].includes(state.imp.phase)) {
      state.imp = { phase: 'pick' };
      if (routePath(route) === from) { render(); return; }
    }
    if (routePath(route) === from && !tab) return;
    if (tab && route.view === 'library' && state.route.view === 'library') {
      // Tapping Library again: back to the top.
      scrollMemory.delete(from);
    }
    if (!['book', 'import'].includes(state.route.view)) backTo = from;
    if (route.view === 'series' && state.route.view !== 'series') seriesBack = from;
    if (route.view !== 'library') state.selection = null;
    if (route.view === 'snapshots') loadSnapshots();
    state.route = route;
    try {
      win.history[replace ? 'replaceState' : 'pushState'](null, '', `#${routePath(route)}`);
    } catch { /* sandboxed */ }
    render();
    if (route.view === 'discover') ensureDeck();
  }

  listen(win, 'popstate', () => {
    state.route = parseRoute(win.location.hash);
    state.selection = null;
    render();
    if (state.route.view === 'discover') ensureDeck();
  });

  // ——— persistence ———
  let pending = null;
  let inflight = null;
  let retryTimer = 0;

  function queueWrite(changes) {
    pending = mergeChanges(pending, changes);
    if (!inflight) inflight = drain();
    return inflight;
  }

  async function drain() {
    clearTimeout(retryTimer);
    while (pending && store) {
      const batch = pending;
      pending = null;
      try {
        await store.commit(batch);
        if (state.saveError) { state.saveError = null; render(); }
        channel?.postMessage({ type: 'changed' });
      } catch (e) {
        pending = mergeChanges(batch, pending);
        state.saveError = e?.name === 'QuotaExceededError' ? 'This device is out of storage space for Catalog.' : 'The browser refused to save.';
        render();
        retryTimer = setTimeout(drain, RETRY_MS);
        break;
      }
    }
    inflight = null;
  }

  function setMeta(values) {
    Object.assign(state.meta, values);
    queueWrite({ meta: values });
  }

  // Apply edits ({ books, notes, progress, collections, settings }) and save them. With a message,
  // shows a toast; undoable ones get an Undo that writes the old values back as new edits.
  function edit(edits, { message, undoable = true, then } = {}) {
    const before = undoable ? captureBefore(state.data, edits) : null;
    state.data = applyEdits(state.data, edits);
    render();
    queueWrite(edits);
    if (message) {
      toast(message, undoable ? {
        action: 'Undo',
        onAction: () => {
          edit(undoEdits(before, state.data, now()), { undoable: false, message: 'Undone.' });
          then?.();
        },
      } : {});
    }
  }

  const bookById = (id) => state.data.books.find((b) => b.id === id);
  const liveCollections = () => state.data.collections.filter((c) => !c.deleted).sort((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0));

  // ——— safety copies ———
  async function snapshot(reason) {
    if (!store) return;
    try {
      await store.saveSnapshot({ at: now(), reason, version: dataVersion(state.data), data: state.data });
      const list = await store.listSnapshots();
      const keep = snapshotsToKeep(list, now());
      const drop = list.filter((s) => !keep.has(s.id)).map((s) => s.id);
      if (drop.length) await store.deleteSnapshots(drop);
    } catch { /* best effort: a missing safety copy never blocks the action */ }
  }

  async function dailySnapshot() {
    if (!store) return;
    try {
      const list = await store.listSnapshots();
      if (snapshotDue(list, dataVersion(state.data), now())) await snapshot('daily');
    } catch { /* best effort */ }
  }

  async function loadSnapshots() {
    if (!store) return;
    state.snapshots = (await store.listSnapshots()).sort((a, b) => b.at - a.at);
    if (state.route.view === 'snapshots') render();
  }

  // ——— online work: look-ups and covers ———
  function goneOffline() {
    if (!state.online) return;
    state.online = false;
    render();
  }

  async function lookup(query, { priority = 'user', limit } = {}) {
    const isbn = isbnFromQuery(query) ?? '';
    const ol = parseOlSearch(await net.get(olSearchUrl(query, { limit }), { priority }), { isbn });
    if (ol.length) return ol;
    try {
      return parseGoogle(await net.get(googleSearchUrl(query), { priority }));
    } catch (e) {
      if (e instanceof OfflineError) throw e;
      return [];
    }
  }

  const DETAIL_FIELDS = ['title', 'subtitle', 'authors', 'year', 'pages', 'publisher', 'coverId', 'coverUrl', 'olWork', 'isbn10'];

  async function runWorkers() {
    const w = state.workers;
    if (w.running || !state.online || now() < w.pausedUntil) return;
    w.running = true;
    const tried = runWorkers.tried ?? (runWorkers.tried = new Set());
    let batch = [];
    const flushBatch = () => {
      if (!batch.length) return;
      const books = batch.map(([id, patch]) => {
        const b = bookById(id);
        return b ? updateBook(b, patch, now()) : null;
      }).filter(Boolean);
      batch = [];
      edit({ books }, { undoable: false });
    };
    try {
      for (;;) {
        if (!state.online) break;
        const live = state.data.books.filter((b) => !b.deleted && !tried.has(b.id));
        const details = live.find((b) => b.needsLookup);
        const wanted = (b) => needsCover(b, now()) || needsSubjects(b, now());
        const cover = details ? null : live.filter(wanted).sort((a, b) => b.addedAt - a.addedAt)[0];
        const book = details ?? cover;
        w.remaining = live.filter((b) => b.needsLookup || wanted(b)).length;
        if (!book) break;
        tried.add(book.id);
        try {
          if (details) {
            const [hit] = await lookup(book.isbn13, { priority: 'background' });
            if (hit) {
              batch.push([book.id, { ...Object.fromEntries(DETAIL_FIELDS.filter((f) => hit[f] != null && hit[f] !== '').map((f) => [f, hit[f]])), needsLookup: false, coverCheckedAt: now() }]);
            }
          } else {
            // One request brings the cover, a missing page count, and the subjects Discover uses.
            const found = parseBookLookup(await net.get(coverLookupUrl(book), { priority: 'background' }));
            const patch = {};
            if (needsCover(book, now())) Object.assign(patch, found?.coverId ? { coverId: found.coverId, olWork: found.olWork } : { coverCheckedAt: now() });
            if (found?.pages && !book.pages) patch.pages = found.pages;
            if (needsSubjects(book, now())) Object.assign(patch, { subjects: found?.subjects ?? [], subjectsAt: now() });
            if (found?.olWork && !book.olWork) patch.olWork = found.olWork;
            batch.push([book.id, patch]);
          }
        } catch (e) {
          if (e instanceof OfflineError) { goneOffline(); break; }
          if (e instanceof HttpError && (e.status === 429 || e.status === 403 || e.status >= 500)) {
            w.pausedUntil = now() + 5 * 60_000; // the service asked us to slow down
            break;
          }
        }
        if (batch.length >= 6) flushBatch();
      }
    } finally {
      flushBatch();
      w.running = false;
      w.remaining = state.data.books.filter((b) => !b.deleted && !tried.has(b.id) && (b.needsLookup || needsCover(b, now()) || needsSubjects(b, now()))).length;
      render();
    }
  }

  const startWorkers = () => { if (workersOn) runWorkers(); };

  // ——— actions ———
  // Status changes carry their reads: starting opens one, finishing closes it (see reads.js).
  function setStatus(ids, status, { message } = {}) {
    let end = queueEndRank(state.data.books);
    const books = [];
    const reads = [];
    for (const id of ids) {
      const b = bookById(id);
      if (!b || b.deleted) continue;
      const change = statusChange(b, state.data.reads, status, today(), now(), { endRank: status === 'want' && !b.queueRank ? end : '' });
      if (change.book.queueRank === end && b.queueRank !== end) end = rankBetween(end, '');
      if (change.book !== b) books.push(change.book);
      reads.push(...change.reads);
    }
    if (books.length) edit({ books, reads }, { message: message ?? (books.length > 1 ? `Moved ${plural(books.length, 'book')} to ${STATUS_LABELS[status]}.` : null) });
    return books.length;
  }

  function newCollection(name) {
    if (findCollection(state.data.collections, name)) {
      toast(`There’s already a collection called “${name}”.`);
      return null;
    }
    const last = liveCollections().at(-1)?.rank ?? '';
    return createCollection({ name, rank: rankBetween(last, '') }, { now: now() });
  }

  function addToCollection(ids, collection, { created = false } = {}) {
    const books = ids.map(bookById).filter((b) => b && !b.deleted && !b.collectionIds.includes(collection.id))
      .map((b) => updateBook(b, { collectionIds: [...b.collectionIds, collection.id] }, now()));
    edit({ books, collections: created ? [collection] : [] }, { message: `Added ${plural(books.length, 'book')} to ${collection.name}.` });
  }

  // `also`: other books changed in the same edit; `extra`: other records (swipes), so one Undo covers all.
  function addBooks(candidates, status, { message = true, also = [], extra = {}, then } = {}) {
    let end = queueEndRank(state.data.books);
    const books = [];
    const reads = [];
    for (const c of candidates) {
      // Open Library results carry their subjects, so the background look-up can skip them.
      const checked = Array.isArray(c.subjects) && !c.subjectsAt ? { subjectsAt: now() } : {};
      const fresh = createBook({ ...c, ...checked, status: 'none' }, { now: now() });
      const change = statusChange(fresh, [], status, today(), now(), { endRank: end });
      if (status === 'want') end = rankBetween(end, '');
      books.push(change.book);
      reads.push(...change.reads);
    }
    const said = message === true ? (books.length === 1 ? `Added ${books[0].title || 'the book'}.` : `Added ${plural(books.length, 'book')}.`) : message || null;
    edit({ ...extra, books: [...books, ...also], reads }, { message: said, then });
    startWorkers();
    return books;
  }

  // ——— Discover ———
  // Lanes are recomputed only when the library, reads, swipes, collections or settings change.
  let tasteMemo = null;
  function taste() {
    const d = state.data;
    const key = [d.books, d.reads, d.swipes, d.collections, d.settings];
    if (!tasteMemo || tasteMemo.key.some((x, i) => x !== key[i])) {
      tasteMemo = { key, value: findLanes(d.books, { reads: d.reads, swipes: d.swipes, collections: d.collections, now: now(), muted: d.settings.mutedLanes }) };
    }
    return tasteMemo.value;
  }

  const disc = state.discover;
  const freshDeck = () => stillFresh(disc.deck, { books: state.data.books, swipes: state.data.swipes, now: now() });
  const persistDeck = () => setMeta({ discover: { deck: disc.deck, cursors: disc.cursors, exhausted: disc.exhausted } });
  const dealCtx = (t, r) => ({ taste: t, books: state.data.books, swipes: state.data.swipes, deck: disc.deck, now: now(), rng: r });

  async function fetchPage(key, next, priority) {
    const found = parseDeal(await net.get(searchUrl(next.query, next.page), { priority }));
    const pool = disc.pools.get(key) ?? [];
    const known = new Set(pool.map((c) => c.work));
    const fresh = found.filter((c) => !known.has(c.work));
    disc.pools.set(key, [...pool, ...fresh]);
    disc.cursors[next.query.id] = next.page + 1;
    if ((found.length < PAGE_SIZE || !fresh.length) && !disc.exhausted.includes(next.query.id)) disc.exhausted.push(next.query.id);
    return fresh.length;
  }

  // Background: descriptions for the next few cards, so turning them over works offline.
  async function prefetchDescriptions(n = 3) {
    for (const c of disc.deck.slice(0, n)) {
      if (c.description || c.descriptionChecked || !state.online) continue;
      try {
        c.description = parseWorkDescription(await net.get(workUrl(c.work), { priority: 'background' }));
        c.descriptionChecked = true;
      } catch (e) {
        if (e instanceof OfflineError) { goneOffline(); return; }
      }
    }
    persistDeck();
    if (state.route.view === 'discover') render();
  }

  // Deals up to `count` cards. Fetches a page for each lane whose pool is running low, plus a
  // wildcard search, adding a couple of cards after each answer so the deck grows while the rest
  // arrive; at most one search per lane and four more per deal, since Open Library is asked about
  // once a second. Cards are dealt by Thompson sampling (discover.js). With `lane`, deals only
  // from that lane, to the front of the deck.
  async function dealCards({ lane = null, priority = 'background', count = DEAL_SIZE } = {}) {
    if (disc.dealing || !state.online) return;
    const base = taste();
    const targets = lane ? base.lanes.filter((l) => l.key === lane).map((l) => ({ ...l, muted: false })) : base.lanes.filter((l) => !l.muted);
    if (!targets.length) return;
    const t = lane ? { ...base, lanes: targets } : base;
    const r = rng((now() % 2_147_483_646) + 1);
    disc.dealing = true;
    disc.error = '';
    render();
    const fresh = [];
    const add = (n) => {
      const pools = lane ? new Map([[lane, disc.pools.get(lane) ?? []]]) : disc.pools;
      const cards = deal(pools, Math.min(n, count - fresh.length), dealCtx(t, r));
      fresh.push(...cards);
      disc.deck = lane ? [...cards, ...disc.deck] : [...disc.deck, ...cards];
      if (cards.length) render();
    };
    let budget = targets.length + 4;
    try {
      if (lane) disc.deck = [...disc.deck.filter((c) => c.lane?.key === lane), ...disc.deck.filter((c) => c.lane?.key !== lane)];
      add(count); // whatever the pools already hold
      for (let round = 0; round < 3 && fresh.length < count && budget > 0; round++) {
        let fetched = false;
        for (const l of targets) {
          if (budget <= 0 || fresh.length >= count) break;
          if (rankPool(disc.pools.get(l.key), l.centroid, dealCtx(t, r)).length >= 4) continue;
          const next = nextQuery(laneQueries(l), disc.cursors, disc.exhausted);
          if (!next) continue;
          await fetchPage(l.key, next, priority);
          budget -= 1;
          fetched = true;
          add(2);
        }
        if (!lane && round === 0 && budget > 0 && rankPool(disc.pools.get(WILDCARD), t.profile, dealCtx(t, r)).length < 2) {
          const wq = wildcardQuery(t, r);
          const next = wq && nextQuery([wq], disc.cursors, disc.exhausted);
          if (next) { await fetchPage(WILDCARD, next, priority); budget -= 1; fetched = true; }
        }
        add(count);
        if (!fetched) break;
      }
      disc.thin = targets.filter((l) => !nextQuery(laneQueries(l), disc.cursors, disc.exhausted) && !rankPool(disc.pools.get(l.key), l.centroid, dealCtx(t, r)).length).map((l) => l.label);
    } catch (e) {
      if (e instanceof OfflineError) goneOffline();
      else disc.error = e instanceof HttpError && (e.status === 429 || e.status >= 500) ? 'Open Library is busy. Try again in a few minutes.' : 'Open Library didn’t answer. Try again in a moment.';
    } finally {
      disc.dealing = false;
      persistDeck();
      for (const c of fresh) if (c.coverId && win.Image) new win.Image().src = coverSrc(c, 'L'); // cached for offline
      render();
    }
    prefetchDescriptions();
  }

  function ensureDeck() {
    if (!state.online || disc.dealing || !taste().lanes.length) return;
    const n = freshDeck().length;
    if (n < DECK_LOW) dealCards({ priority: n ? 'background' : 'user' });
  }

  // ——— series on Wikidata ———
  // The series a book is in: by its Open Library work, then by title and author.
  async function findSeriesOf(book, knownName, priority) {
    const tries = book.olWork ? [book, { ...book, olWork: '' }] : [book];
    for (const b of tries) {
      const s = pickSeries(parseFoundSeries(await net.get(wdFindSeriesUrl(b), { priority })), knownName);
      if (s) return s;
    }
    return null;
  }

  // Wikidata's name for a series, spelled the way the library already spells it.
  const seriesName = (name) => seriesList(state.data.books).find((s) => s.key === seriesKey(name))?.name ?? name;
  const rememberSeries = (name, id) => {
    const key = seriesKey(name);
    const look = state.series.get(key);
    if (!look?.id) state.series.set(key, { ...look, id });
  };

  // After adding one book while online: quietly find its series, so the Add page can offer the rest.
  async function seriesForNewBook(id) {
    if (!state.online || bookById(id)?.seriesName) return;
    try {
      const s = await findSeriesOf(bookById(id), '', 'background');
      const b = bookById(id);
      if (!s || !b || b.deleted || b.seriesName) return;
      const name = seriesName(s.name);
      rememberSeries(name, s.id);
      edit({ books: [updateBook(b, { seriesName: name, seriesNumber: s.number }, now())] }, { undoable: false });
    } catch { /* a nice-to-have: the book page can look again */ }
  }

  // A read's dates; returns false (and says why) when the start is after the finish.
  const datesOk = ({ started, finished }) => {
    if (started && finished && started > finished) { toast('The start date is after the finish date.'); return false; }
    return true;
  };

  async function readFile(file) {
    if (file.text) return file.text();
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error);
      r.readAsText(file);
    });
  }

  const actions = {
    go,
    back: () => go(state.route.view === 'series' ? seriesBack : backTo || '/library'),
    flush: async () => { while (inflight) await inflight; },
    runWorkers,
    render,

    // library
    setFilter(patch) {
      Object.assign(state.library, patch);
      const prefs = Object.fromEntries(PREF_KEYS.map((k) => [k, state.library[k]]));
      setMeta({ prefs });
      render();
    },
    setQuery(q) {
      state.library.query = q;
      render();
    },
    showCollection(id) {
      Object.assign(state.library, { collection: id, status: 'all', query: '' });
      go('/library');
    },
    startSelect(id) {
      state.selection = new Set(id ? [id] : []);
      render();
    },
    toggleSelect(id, { shift = false, order = [] } = {}) {
      const sel = state.selection;
      if (!sel) return;
      if (shift && actions.anchor && order.includes(actions.anchor)) {
        const [a, b] = [order.indexOf(actions.anchor), order.indexOf(id)].sort((x, y) => x - y);
        for (const x of order.slice(a, b + 1)) sel.add(x);
      } else if (sel.has(id)) sel.delete(id);
      else sel.add(id);
      actions.anchor = id;
      render();
    },
    selectAll(ids) {
      for (const id of ids) state.selection?.add(id);
      render();
    },
    endSelect() {
      state.selection = null;
      render();
    },
    bulkStatus() {
      const ids = [...(state.selection ?? [])];
      sheet({ title: `Set status for ${plural(ids.length, 'book')}`, items: ['want', 'reading', 'read', 'none'].map((s) => ({ label: STATUS_LABELS[s], attrs: { 'data-status': s }, onClick: () => setStatus(ids, s, { message: `Moved ${plural(ids.length, 'book')} to ${STATUS_LABELS[s]}.` }) })) });
    },
    bulkCollection() {
      const ids = [...(state.selection ?? [])];
      const cs = liveCollections();
      const inSome = cs.filter((c) => ids.some((id) => bookById(id)?.collectionIds.includes(c.id)));
      sheet({
        title: `Collections for ${plural(ids.length, 'book')}`,
        items: [
          ...cs.map((c) => ({ label: `Add to ${c.name}`, onClick: () => addToCollection(ids, c) })),
          { label: 'New collection…', onClick: () => promptDialog({ title: 'New collection', label: 'Name', ok: 'Create', onSubmit: (name) => { const c = newCollection(name); if (c) addToCollection(ids, c, { created: true }); } }) },
          inSome.length ? null : false,
          ...inSome.map((c) => ({ label: `Remove from ${c.name}`, onClick: () => {
            const books = ids.map(bookById).filter((b) => b?.collectionIds.includes(c.id)).map((b) => updateBook(b, { collectionIds: b.collectionIds.filter((x) => x !== c.id) }, now()));
            edit({ books }, { message: `Removed ${plural(books.length, 'book')} from ${c.name}.` });
          } })),
        ],
      });
    },
    bulkDelete() {
      const ids = [...(state.selection ?? [])];
      confirmDialog({
        title: `Delete ${plural(ids.length, 'book')}?`,
        body: 'Their notes and progress go with them. You can bring them back from Settings → Recently deleted.',
        ok: 'Delete', danger: true,
        onConfirm: async () => {
          await snapshot('delete');
          const books = ids.map(bookById).filter((b) => b && !b.deleted).map((b) => updateBook(b, { deleted: true }, now()));
          state.selection = null;
          edit({ books }, { message: `Deleted ${plural(books.length, 'book')}.` });
        },
      });
    },
    bulkMore() {
      const ids = [...(state.selection ?? [])];
      sheet({
        title: plural(ids.length, 'book'),
        items: [
          { label: 'Look for covers again', onClick: () => {
            const books = ids.map(bookById).filter((b) => b && !b.coverId && !b.coverUrl).map((b) => updateBook(b, { coverCheckedAt: 0 }, now()));
            runWorkers.tried?.clear();
            edit({ books }, { undoable: false, message: state.online ? `Looking for ${plural(books.length, 'cover')}.` : 'Covers will be looked up when you’re back online.' });
            startWorkers();
          } },
          { label: 'Export as Goodreads CSV', onClick: () => {
            const set = new Set(ids);
            saveFile(`catalog-selection-${today()}.csv`, goodreadsCsv({ ...state.data, books: state.data.books.filter((b) => set.has(b.id)) }), 'text/csv');
          } },
        ],
      });
    },
    snoozeBackup() {
      setMeta({ backupSnoozedUntil: now() + 3 * DAY });
      render();
    },
    backupDue() {
      if ((state.meta.backupSnoozedUntil ?? 0) > now()) return false;
      const books = state.data.books.filter((b) => !b.deleted).length;
      return backupDue({ lastExport: state.meta.lastExport ?? null, lastChange: dataVersion(state.data), bookCount: books }, now());
    },

    // one book
    setStatus: (id, status) => setStatus([id], status),
    updateBook(id, patch, message) {
      const b = bookById(id);
      if (!b) return;
      const next = updateBook(b, patch, now());
      if (next !== b) edit({ books: [next] }, { message, undoable: !!message });
    },
    toggleCollection(id, cid) {
      const b = bookById(id);
      const ids = b.collectionIds.includes(cid) ? b.collectionIds.filter((x) => x !== cid) : [...b.collectionIds, cid];
      edit({ books: [updateBook(b, { collectionIds: ids }, now())] }, { undoable: false });
    },
    newCollectionFor(id) {
      promptDialog({ title: 'New collection', label: 'Name', ok: 'Create', onSubmit: (name) => {
        const c = newCollection(name);
        if (!c) return;
        const b = bookById(id);
        edit({ collections: [c], books: [updateBook(b, { collectionIds: [...b.collectionIds, c.id] }, now())] }, { undoable: false });
      } });
    },
    addProgress(id, { page, percent }) {
      const p = createProgress({ bookId: id, page, percent }, { now: now() });
      if (p) edit({ progress: [p] }, { undoable: false });
    },
    addNote(id, text, page, readId = '') {
      const n = createNote({ bookId: id, text, page, readId: readId || undefined }, { now: now() });
      if (n) edit({ notes: [n] }, { undoable: false });
      return !!n;
    },
    editNote(noteId, text) {
      const n = state.data.notes.find((x) => x.id === noteId);
      const next = touch(n, { text }, now(), sanitizeNote);
      if (next !== n) edit({ notes: [next] }, { undoable: false });
    },
    deleteNote(noteId) {
      const n = state.data.notes.find((x) => x.id === noteId);
      edit({ notes: [{ ...n, deleted: true, updatedAt: now() }] }, { message: 'Note deleted.' });
    },
    addRead(bookId, { started = '', finished = '' }) {
      if (!datesOk({ started, finished })) return false;
      edit({ reads: [createRead({ bookId, started, finished, done: true }, { now: now() })] }, { undoable: false });
      return true;
    },
    editRead(id, dates) {
      const r = state.data.reads.find((x) => x.id === id);
      const next = sanitizeRead({ ...r, ...dates, done: r.done || !!dates.finished, updatedAt: now() });
      if (!next || !datesOk(next)) return false;
      edit({ reads: [next] }, { undoable: false });
      return true;
    },
    deleteRead(id) {
      const r = state.data.reads.find((x) => x.id === id);
      edit({ reads: [{ ...r, deleted: true, updatedAt: now() }] }, { message: 'Read deleted.' });
    },
    deleteBook(id) {
      const b = bookById(id);
      edit({ books: [updateBook(b, { deleted: true }, now())] }, { message: `Deleted ${b.title || 'the book'}.` });
      go('/library', { replace: true });
    },
    restoreBooks(ids) {
      const books = ids.map(bookById).filter((b) => b?.deleted).map((b) => updateBook(b, { deleted: false }, now()));
      edit({ books }, { message: `Restored ${plural(books.length, 'book')}.` });
    },
    async refreshDetails(id) {
      const b = bookById(id);
      try {
        const [hit] = await lookup(b.isbn13 || `${b.title} ${b.authors[0] ?? ''}`, { limit: 1 });
        const patch = hit ? Object.fromEntries(['year', 'pages', 'publisher', 'subtitle', 'coverId', 'coverUrl', 'olWork'].filter((f) => hit[f] != null && hit[f] !== '' && !b[f]).map((f) => [f, hit[f]])) : {};
        const filled = Object.keys(patch).length > 0;
        let series = null;
        if (!b.seriesName) {
          try {
            series = await findSeriesOf({ ...b, ...patch }, '', 'user');
          } catch (e) {
            if (e instanceof OfflineError) throw e; // Wikidata being down shouldn't hide the details found
          }
        }
        if (series) {
          Object.assign(patch, { seriesName: seriesName(series.name), seriesNumber: series.number });
          rememberSeries(patch.seriesName, series.id);
        }
        if (!filled && !series) { toast(hit ? 'Nothing new found online.' : 'No details found online for this book.'); return; }
        actions.updateBook(id, patch, [filled ? 'Filled in missing details.' : '', series ? `Part of ${seriesLabel(patch)}.` : ''].filter(Boolean).join(' '));
      } catch (e) {
        if (e instanceof OfflineError) goneOffline();
        else toast('Couldn’t reach the book service. Try again later.');
      }
    },

    // to-read queue
    moveInQueue(id, toIndex) {
      let queue = toReadQueue(state.data.books);
      const edits = [];
      // Unranked or tied books get ranks first, in their current order, so there's room between them.
      const ranked = queue.every((b, i) => b.queueRank && (i === 0 || b.queueRank > queue[i - 1].queueRank));
      if (!ranked) {
        const ranks = spreadRanks(queue.length);
        queue = queue.map((b, i) => updateBook(b, { queueRank: ranks[i] }, now()));
        edits.push(...queue);
      }
      const from = queue.findIndex((b) => b.id === id);
      const rest = queue.filter((b) => b.id !== id);
      const to = Math.max(0, Math.min(rest.length, toIndex));
      if (from === to && ranked) return;
      const rank = rankBetween(rest[to - 1]?.queueRank ?? '', rest[to]?.queueRank ?? '');
      const moved = updateBook(queue[from], { queueRank: rank }, now());
      const byId = new Map(edits.map((b) => [b.id, b]));
      byId.set(moved.id, moved);
      edit({ books: [...byId.values()] }, { undoable: false });
    },

    // collections
    createCollection() {
      promptDialog({ title: 'New collection', label: 'Name', ok: 'Create', onSubmit: (name) => {
        const c = newCollection(name);
        if (c) edit({ collections: [c] }, { undoable: false });
      } });
    },
    renameCollection(id) {
      const c = state.data.collections.find((x) => x.id === id);
      promptDialog({ title: 'Rename collection', label: 'Name', value: c.name, onSubmit: (name) => {
        const other = findCollection(state.data.collections, name);
        if (other && other.id !== id) { toast(`There’s already a collection called “${name}”.`); return; }
        edit({ collections: [{ ...c, name, updatedAt: now() }] }, { undoable: false });
      } });
    },
    moveCollection(id, dir) {
      const cs = liveCollections();
      const i = cs.findIndex((c) => c.id === id);
      const rest = cs.filter((c) => c.id !== id);
      const to = Math.max(0, Math.min(rest.length, i + dir));
      if (to === i) return;
      let list = rest;
      const edits = [];
      if (rest.some((c, k) => !c.rank || (k > 0 && c.rank <= rest[k - 1].rank))) {
        const ranks = spreadRanks(rest.length);
        list = rest.map((c, k) => ({ ...c, rank: ranks[k], updatedAt: now() }));
        edits.push(...list);
      }
      edits.push({ ...cs[i], rank: rankBetween(list[to - 1]?.rank ?? '', list[to]?.rank ?? ''), updatedAt: now() });
      edit({ collections: edits }, { undoable: false });
    },
    deleteCollection(id) {
      const c = state.data.collections.find((x) => x.id === id);
      const members = state.data.books.filter((b) => b.collectionIds.includes(id));
      confirmDialog({
        title: `Delete “${c.name}”?`,
        body: members.length ? `${plural(members.length, 'book')} stay in your library; only the collection goes.` : null,
        ok: 'Delete', danger: true,
        onConfirm: () => {
          if (state.library.collection === id) state.library.collection = 'all';
          edit({
            collections: [{ ...c, deleted: true, updatedAt: now() }],
            books: members.map((b) => updateBook(b, { collectionIds: b.collectionIds.filter((x) => x !== id) }, now())),
          }, { message: `Deleted ${c.name}.` });
        },
      });
    },

    // Discover
    taste,
    deck: freshDeck,
    dealCards,
    needingSubjects: () => state.data.books.filter((b) => needsSubjects(b, now())).length,
    // Each swipe is one undoable edit: the verdict, plus the book for "want" and "read". Undo puts
    // the card back on top. "Already read" gets a read with no date, so it counts as read without
    // landing in this year's numbers (like a Goodreads import's undated reads).
    swipe(work, verdict) {
      const card = disc.deck.find((c) => c.work === work);
      if (!card) return;
      const s = createSwipe({ work, title: card.title, authors: card.authors, verdict, features: card.features, peeked: disc.peeked.has(work) }, { now: now() });
      disc.deck = disc.deck.filter((c) => c !== card);
      disc.details = null;
      persistDeck();
      const then = () => {
        if (!disc.deck.some((c) => c.work === work)) disc.deck.unshift(card);
        persistDeck();
        render();
      };
      if (verdict === 'no') edit({ swipes: [s] }, { message: 'Passed.', then });
      else if (verdict === 'want') addBooks([cardToBook(card, now())], 'want', { extra: { swipes: [s] }, message: 'Added to Want to read.', then });
      else {
        const b = createBook({ ...cardToBook(card, now()), status: 'read' }, { now: now() });
        edit({ books: [b], reads: reconcileReads(b.id, [], { count: 1 }, now()), swipes: [s] }, { message: 'Marked as read.', then });
        startWorkers();
      }
      ensureDeck();
    },
    async openDetails(work) {
      const card = disc.deck.find((c) => c.work === work);
      if (!card) return;
      disc.details = work;
      disc.peeked.add(work);
      render();
      if (card.description || card.descriptionChecked || !state.online) return;
      try {
        card.description = parseWorkDescription(await net.get(workUrl(work), { priority: 'user' }));
        card.descriptionChecked = true;
        persistDeck();
        render();
      } catch (e) {
        if (e instanceof OfflineError) goneOffline();
      }
    },
    closeDetails() {
      disc.details = null;
      render();
    },
    // Searches from the card's own subjects and author, ranked toward the card (half its lane,
    // half the card), and slots the best few in right after it.
    async moreLike(work) {
      const card = disc.deck.find((c) => c.work === work);
      if (!card || !state.online) return;
      disc.details = null;
      disc.dealing = true;
      render();
      const t = taste();
      const lane = t.lanes.find((l) => l.key === card.lane?.key);
      const target = blend(lane?.centroid ?? t.profile, vectorize(featuresFromKeys(card.features), t.idf));
      const subs = card.subjects.slice(0, 2).map((x) => `"${x.replace(/"/g, '')}"`);
      const queries = [
        subs.length === 2 ? `subject:${subs[0]} AND subject:${subs[1]}` : subs[0] ? `subject:${subs[0]}` : '',
        card.authors[0] ? `author:"${card.authors[0].replace(/"/g, '')}"` : '',
      ].filter(Boolean).map((q) => ({ q, sort: 'readinglog', id: `like|${q}` }));
      const key = `like:${work}`;
      try {
        for (const q of queries) {
          const next = nextQuery([q], disc.cursors, disc.exhausted);
          if (next) await fetchPage(key, next, 'user');
        }
        const cards = rankPool(disc.pools.get(key), target, dealCtx(t, null)).slice(0, 5).map((c) => ({ ...c, lane: card.lane }));
        const at = disc.deck.findIndex((c) => c.work === work);
        disc.deck.splice(at + 1, 0, ...cards);
        toast(cards.length ? `${plural(cards.length, 'more book')} like ${card.title} up next.` : 'Nothing new like this one right now.');
      } catch (e) {
        if (e instanceof OfflineError) goneOffline();
        else toast('Open Library didn’t answer. Try again in a moment.');
      } finally {
        disc.dealing = false;
        persistDeck();
        render();
      }
    },
    dealFromLane(key) {
      go('/discover');
      dealCards({ lane: key, priority: 'user', count: 8 });
    },
    muteLane(key, muted) {
      const s = state.data.settings;
      const mutedLanes = muted ? [...new Set([...s.mutedLanes, key])] : s.mutedLanes.filter((k) => k !== key);
      if (muted) {
        disc.deck = disc.deck.filter((c) => c.lane?.key !== key);
        persistDeck();
      }
      edit({ settings: { ...s, mutedLanes, updatedAt: now() } }, { undoable: false });
    },
    restoreSwipe(id) {
      const s = state.data.swipes.find((x) => x.id === id);
      if (s) edit({ swipes: [{ ...s, deleted: true, updatedAt: now() }] }, { message: `${s.title || 'That book'} can turn up again.` });
    },
    clearDismissed() {
      const list = state.data.swipes.filter((s) => !s.deleted && s.verdict === 'no');
      if (!list.length) return;
      confirmDialog({
        title: `Clear ${plural(list.length, 'book')}?`,
        body: 'Every book you passed on can be dealt again, and Discover forgets what it learned from them. A safety copy is saved first.',
        ok: 'Clear all',
        danger: true,
        onConfirm: async () => {
          await snapshot('dismissed');
          edit({ swipes: list.map((s) => ({ ...s, deleted: true, updatedAt: now() })) }, { message: `Cleared ${plural(list.length, 'book')}.` });
        },
      });
    },

    // series
    seriesLookup: (name) => state.series.get(seriesKey(name)) ?? null,
    openSeries(name, { find = false } = {}) {
      go(`/series/${name}`);
      if (find && actions.seriesLookup(name)?.phase !== 'done') actions.findRest(name);
    },
    async findRest(name) {
      const key = seriesKey(name);
      const look = state.series.get(key) ?? {};
      state.series.set(key, { ...look, phase: 'looking' });
      render();
      try {
        let id = look.id;
        for (const b of id ? [] : booksInSeries(state.data.books, name).slice(0, 2)) {
          id = (await findSeriesOf(b, name, 'user'))?.id;
          if (id) break;
        }
        const members = id ? parseMembers(await net.get(wdMembersUrl(id), { priority: 'user' })) : [];
        const picked = new Set(members.filter((m) => m.number && !matchMember(state.data.books, m)).map((m) => m.id));
        state.series.set(key, { phase: members.length ? 'done' : 'none', id, members, picked });
      } catch (e) {
        if (e instanceof OfflineError) goneOffline();
        state.series.set(key, { ...look, phase: 'error' });
      }
      render();
    },
    pickRest(name, memberId, on) {
      const look = state.series.get(seriesKey(name));
      if (!look?.picked) return;
      if (on) look.picked.add(memberId);
      else look.picked.delete(memberId);
      render();
    },
    // Adds the checked books as Want to read, in series order at the end of the queue; books already
    // in the library that Wikidata lists get their place in the series, in the same undoable edit.
    addRest(name) {
      const look = state.series.get(seriesKey(name));
      if (!look?.members) return;
      const display = seriesName(name);
      const fallbackAuthors = booksInSeries(state.data.books, name)[0]?.authors ?? [];
      const fresh = [];
      const tag = [];
      for (const m of look.members) {
        const have = matchMember(state.data.books, m);
        if (have) {
          if (!have.seriesName) tag.push(updateBook(have, { seriesName: display, seriesNumber: m.number }, now()));
        } else if (look.picked.has(m.id)) {
          fresh.push({ title: m.title, authors: m.authors.length ? m.authors : fallbackAuthors, olWork: m.olWork, originalYear: m.year, seriesName: display, seriesNumber: m.number, source: 'wikidata' });
        }
      }
      if (!fresh.length && !tag.length) return;
      addBooks(fresh, 'want', {
        also: tag,
        message: fresh.length ? `Added ${plural(fresh.length, 'book')} to Want to read.` : `Marked ${plural(tag.length, 'book')} as part of ${display}.`,
      });
    },

    // adding
    setAdd(patch) {
      Object.assign(state.add, patch);
      render();
    },
    async search() {
      const q = state.add.query.trim();
      if (!q) return;
      state.add.phase = 'searching';
      state.add.results = [];
      render();
      try {
        const results = await lookup(q);
        if (state.add.query.trim() !== q) return;
        Object.assign(state.add, { phase: 'done', results });
      } catch (e) {
        if (e instanceof OfflineError) { state.add.phase = 'idle'; goneOffline(); return; }
        Object.assign(state.add, { phase: 'error' });
      }
      render();
    },
    addCandidate(c) {
      const b = addBooks([c], state.add.status)[0];
      seriesForNewBook(b.id);
      return b;
    },
    addManual(fields) {
      const b = addBooks([{ ...fields, source: 'manual' }], state.add.status)[0];
      seriesForNewBook(b.id);
      return b;
    },
    scan() {
      openScanner({
        onDone: (isbns) => {
          if (!isbns.length) return;
          if (!state.online && isbns.length > 1) { actions.saveManyForLater(isbns); return; }
          if (isbns.length === 1) {
            state.add.query = isbns[0];
            if (state.online) actions.search();
            else actions.saveManyForLater(isbns);
            return;
          }
          actions.lookupList(isbns.join('\n'));
        },
      }).catch(() => toast('The camera couldn’t be opened.'));
    },
    saveManyForLater(isbns) {
      const fresh = [...new Set(isbns)].filter((isbn13) => !findDuplicate(state.data.books, { isbn13 }));
      if (fresh.length) addBooks(fresh.map((isbn13) => ({ isbn13, needsLookup: true, source: 'manual' })), state.add.status, { message: false });
      const skipped = new Set(isbns).size - fresh.length;
      toast(`Saved ${plural(fresh.length, 'book')}${skipped ? ` (${skipped} already in your library)` : ''}. Details fill in when you’re online.`);
      render();
    },
    saveForLater(isbn13) {
      if (findDuplicate(state.data.books, { isbn13 })) { toast('That book is already in your library.'); return; }
      addBooks([{ isbn13, needsLookup: true, source: 'manual' }], state.add.status, { message: false });
      toast('Saved. Its details will fill in next time you’re online.');
      state.add.query = '';
      render();
    },
    async lookupList(text) {
      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 200);
      const rows = lines.map((line) => ({ line, phase: 'waiting', match: null, checked: false }));
      state.add.paste = { text, rows };
      render();
      for (const row of rows) {
        if (!state.online) { row.phase = 'offline'; continue; }
        row.phase = 'looking';
        render();
        try {
          const [hit] = await lookup(row.line, { limit: 3 });
          row.match = hit ?? null;
          row.dup = hit ? !!findDuplicate(state.data.books, hit) : false;
          row.checked = !!hit && !row.dup;
          row.phase = 'done';
        } catch (e) {
          row.phase = e instanceof OfflineError ? 'offline' : 'error';
          if (e instanceof OfflineError) goneOffline();
        }
        render();
      }
    },
    toggleBatchRow(i) {
      const row = state.add.paste?.rows[i];
      if (row?.match) row.checked = !row.checked;
      render();
    },
    addBatch() {
      const rows = state.add.paste?.rows.filter((r) => r.checked && r.match) ?? [];
      if (!rows.length) return;
      addBooks(rows.map((r) => r.match), state.add.status);
      state.add.paste = null;
      render();
    },

    // Goodreads import
    async importFile(file) {
      state.imp = { phase: 'reading', fileName: file.name };
      render();
      const parsed = parseGoodreads(await readFile(file));
      if (!parsed.ok) { state.imp = { phase: 'error', error: parsed.error, fileName: file.name }; render(); return; }
      state.imp = { phase: 'preview', fileName: file.name, rows: parsed.rows, skipped: parsed.skipped, updateExisting: true };
      state.imp.plan = planImport(parsed.rows, state.data, { now: now(), updateExisting: true });
      render();
    },
    setImportUpdate(on) {
      state.imp.updateExisting = on;
      state.imp.plan = planImport(state.imp.rows, state.data, { now: now(), updateExisting: on });
      render();
    },
    async confirmImport() {
      const { plan } = state.imp;
      state.imp.phase = 'importing';
      render();
      await snapshot('import');
      const fresh = planImport(state.imp.rows, state.data, { now: now(), updateExisting: state.imp.updateExisting });
      edit(fresh.edits, { undoable: false });
      state.imp = { phase: 'done', counts: fresh.counts ?? plan.counts };
      render();
      startWorkers();
    },

    // backups
    async exportBackup() {
      const text = JSON.stringify(exportData(state.data, now()), null, 1);
      const ok = await saveFile(backupFilename(now()), text, 'application/json');
      if (ok) {
        setMeta({ lastExport: now() });
        render();
        toast('Backup saved.');
      }
    },
    async importBackupFile(file) {
      const parsed = parseBackup(await readFile(file));
      if (!parsed.ok) { toast(parsed.error); return; }
      const { data, report } = mergeData(state.data, parsed.data);
      const parts = [
        report.added && `${plural(report.added, 'new book')}`,
        report.updated && `${report.updated} updated`,
        report.removed && `${report.removed} deleted`,
      ].filter(Boolean);
      confirmDialog({
        title: 'Merge this backup?',
        body: parts.length || report.records ? `${parts.join(', ') || 'No book changes'}${report.records ? `, plus ${plural(report.records, 'note, collection or progress change', 'notes, collections and progress changes')}` : ''}. Newer edits win, book by book and field by field.` : 'This backup has nothing your library doesn’t already have.',
        ok: 'Merge',
        onConfirm: async () => {
          await snapshot('merge');
          const edits = { books: data.books.filter((b) => b !== state.data.books.find((x) => x.id === b.id)) };
          for (const k of KINDS) edits[k] = data[k].filter((r) => !state.data[k].includes(r));
          if (data.settings !== state.data.settings) edits.settings = data.settings;
          edit(edits, { undoable: false, message: 'Backup merged.' });
          startWorkers();
        },
      });
    },
    exportGoodreads() {
      saveFile(`catalog-goodreads-${today()}.csv`, goodreadsCsv(state.data), 'text/csv');
    },

    // settings
    setGoal(year, { books, pages }) {
      const goals = sanitizeGoals({ ...state.data.settings.goals, [year]: { books, pages } });
      edit({ settings: { ...state.data.settings, goals, updatedAt: now() } }, { undoable: false });
    },
    setStatsYear(year) {
      state.statsYear = year;
      state.statsShowAll = false;
      render();
    },
    showAllFinished() {
      state.statsShowAll = true;
      render();
    },
    setCats(level) {
      edit({ settings: { ...state.data.settings, cats: level, updatedAt: now() } }, { undoable: false });
    },
    loadSnapshots,
    async snapshotNow() {
      await snapshot('manual');
      await loadSnapshots();
      toast('Safety copy saved on this device.');
    },
    restoreSnapshot(id) {
      const s = state.snapshots?.find((x) => x.id === id);
      confirmDialog({
        title: 'Restore this copy?',
        body: `Your library goes back to how it was then (${plural(s?.counts?.books ?? 0, 'book')}). A copy of how it is now is saved first, so you can change your mind.`,
        ok: 'Restore',
        onConfirm: async () => {
          const data = await store.readSnapshot(id);
          if (!data) { toast('That copy couldn’t be read.'); return; }
          await snapshot('restore');
          const edits = restoreEdits(state.data, data, now());
          edit(edits, { undoable: false, message: 'Restored.' });
          await loadSnapshots();
        },
      });
    },
    showWhatsNew() {
      const releases = parseChangelog(changelog);
      const [latest, ...earlier] = releasesUpTo(releases, version);
      if (latest) showWhatsNew({ title: 'What’s new', releases: [latest], earlier });
    },
    setUpdateReady(restart) {
      state.updateReady = restart;
      render();
    },
    applyUpdate: () => state.updateReady?.(),
    setPersisted(granted) {
      state.persisted = granted;
      if (state.route.view === 'settings') render();
    },
    online: () => state.online,
    toast,
    collections: liveCollections,
  };

  // ——— startup ———
  function announceUpdate() {
    const seen = state.meta.seenVersion ?? null;
    if (seen === version) return;
    setMeta({ seenVersion: version });
    if (seen == null) return; // a first launch isn't an update
    const notes = notesSince(parseChangelog(changelog), seen, version, 3);
    if (notes.length) showWhatsNew({ title: 'What’s new', releases: notes });
  }

  async function load() {
    try {
      if (!store) store = await openStore({ onVersionChange: () => { state.reloadNeeded = true; render(); } });
    } catch {
      store = createMemoryStore(); // IndexedDB unavailable (some private modes): run, but warn
    }
    state.storageKind = store.kind;
    const { data, meta } = await store.loadAll();
    state.data = data;
    state.meta = meta;
    const saved = meta.discover;
    if (saved && typeof saved === 'object') {
      disc.deck = Array.isArray(saved.deck) ? saved.deck.filter((c) => typeof c?.work === 'string' && typeof c.title === 'string') : [];
      disc.cursors = saved.cursors && typeof saved.cursors === 'object' ? saved.cursors : {};
      disc.exhausted = Array.isArray(saved.exhausted) ? saved.exhausted : [];
    }
    for (const k of PREF_KEYS) if (meta.prefs?.[k] != null) state.library[k] = meta.prefs[k];
    if (state.library.collection !== 'all' && state.library.collection !== 'none' && !data.collections.some((c) => c.id === state.library.collection && !c.deleted)) state.library.collection = 'all';
    state.loading = false;
    render();
    announceUpdate();
    dailySnapshot();
    startWorkers();
    if (state.route.view === 'discover') ensureDeck();
  }

  listen(win, 'online', () => { state.online = isOnline(); render(); startWorkers(); if (state.route.view === 'discover') ensureDeck(); });
  listen(win, 'offline', () => { state.online = false; render(); });
  listen(win.document, 'visibilitychange', () => {
    if (win.document.visibilityState === 'hidden') { drain(); dailySnapshot(); }
  });
  const hourly = setInterval(() => { dailySnapshot(); startWorkers(); }, 60 * 60_000);
  if (channel) {
    channel.onmessage = async (e) => {
      if (e.data?.type !== 'changed' || !store) return;
      const { data } = await store.loadAll();
      state.data = applyEdits(data, pending ?? {});
      render();
    };
  }

  render();
  const ready = load();

  return {
    actions,
    state: () => state,
    ready,
    destroy() {
      destroyed = true;
      ac.abort();
      renderAbort?.abort();
      clearInterval(hourly);
      clearTimeout(retryTimer);
      channel?.close?.();
      cats.destroy();
      win.document.querySelectorAll('dialog, .toast').forEach((d) => d.remove());
    },
  };
}
