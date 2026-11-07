// Where the library lives on the device. Memory holds the working copy; this store is the durable
// copy behind it. The app reads everything once at launch (loadAll) and from then on only writes:
// each user action is one commit, one transaction, all or nothing.
//
// Transactions close themselves as soon as no database request is pending, so a commit never
// awaits anything but its own puts: all values are computed before the transaction opens.
import { openDB } from 'idb';
import { readRecords, summarize } from '../lib/backup.js';
import { emptyData, KINDS } from '../lib/merge.js';
import { sanitizeSettings } from '../lib/settings.js';

export const DB_VERSION = 1;
const RECORDS = ['books', ...KINDS];

// Schema history: each step upgrades from the version before it. Never edit a released step.
const MIGRATIONS = [
  (db) => {
    for (const s of RECORDS) db.createObjectStore(s, { keyPath: 'id' });
    db.createObjectStore('meta'); // settings and device-only values, keyed by name
    db.createObjectStore('snapshots', { keyPath: 'id' }); // { id, at, reason, version, counts }
    db.createObjectStore('snapshotData', { keyPath: 'id' }); // { id, gz } or { id, json }
  },
];

async function gzip(text) {
  if (typeof CompressionStream === 'undefined') return null;
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

function splitMeta(entries) {
  const meta = {};
  let settings;
  for (const [k, v] of entries) {
    if (k === 'settings') settings = v;
    else meta[k] = v;
  }
  return { meta, settings: sanitizeSettings(settings) };
}

const snapshotId = (at) => `${at}-${Math.random().toString(36).slice(2, 7)}`;

export async function openStore({ name = 'catalog', onVersionChange } = {}) {
  const db = await openDB(name, DB_VERSION, {
    upgrade(d, oldVersion) {
      for (let v = oldVersion; v < DB_VERSION; v++) MIGRATIONS[v](d);
    },
    // Another tab is opening a newer version: let it, and tell this tab to reload.
    blocking() {
      db.close();
      onVersionChange?.();
    },
  });

  return {
    kind: 'indexeddb',

    async loadAll() {
      const tx = db.transaction([...RECORDS, 'meta'], 'readonly');
      const [lists, keys, values] = await Promise.all([
        Promise.all(RECORDS.map((s) => tx.objectStore(s).getAll())),
        tx.objectStore('meta').getAllKeys(),
        tx.objectStore('meta').getAll(),
      ]);
      const raw = Object.fromEntries(RECORDS.map((s, i) => [s, lists[i]]));
      const { meta, settings } = splitMeta(keys.map((k, i) => [k, values[i]]));
      const { data } = readRecords({ ...raw, settings });
      return { data, meta };
    },

    // changes: { books?, notes?, progress?, collections?: records to put; settings?; meta?: { key: value } }
    async commit(changes) {
      const tx = db.transaction([...RECORDS, 'meta'], 'readwrite');
      // A put can throw synchronously (a value that can't be stored): abort so earlier puts roll back.
      const pending = [tx.done];
      try {
        for (const s of RECORDS) for (const r of changes[s] ?? []) pending.push(tx.objectStore(s).put(r));
        if (changes.settings) pending.push(tx.objectStore('meta').put(changes.settings, 'settings'));
        for (const [k, v] of Object.entries(changes.meta ?? {})) pending.push(tx.objectStore('meta').put(v, k));
        await Promise.all(pending);
      } catch (e) {
        for (const p of pending) p.catch(() => {}); // they all reject with the abort; e is the cause
        try { tx.abort(); } catch { /* already finished */ }
        throw e;
      }
    },

    async listSnapshots() {
      return (await db.getAll('snapshots')).sort((a, b) => a.at - b.at);
    },

    async saveSnapshot({ at, reason, version, data }) {
      const json = JSON.stringify(data);
      const gz = await gzip(json); // before the transaction opens
      const id = snapshotId(at);
      const tx = db.transaction(['snapshots', 'snapshotData'], 'readwrite');
      await Promise.all([
        tx.objectStore('snapshots').put({ id, at, reason, version, counts: summarize(data) }),
        tx.objectStore('snapshotData').put(gz ? { id, gz } : { id, json }),
        tx.done,
      ]);
      return id;
    },

    async readSnapshot(id) {
      const row = await db.get('snapshotData', id);
      if (!row) return null;
      const json = row.gz ? await gunzip(row.gz) : row.json;
      return readRecords(JSON.parse(json)).data;
    },

    async deleteSnapshots(ids) {
      const tx = db.transaction(['snapshots', 'snapshotData'], 'readwrite');
      await Promise.all([...ids.flatMap((id) => [tx.objectStore('snapshots').delete(id), tx.objectStore('snapshotData').delete(id)]), tx.done]);
    },

    close: () => db.close(),
  };
}

// Same interface, in memory: for tests, and the fallback when IndexedDB is unavailable
// (some private browsing modes), where nothing survives a reload.
export function createMemoryStore(initial = {}) {
  const records = Object.fromEntries(RECORDS.map((s) => [s, new Map((initial[s] ?? []).map((r) => [r.id, r]))]));
  const meta = new Map(Object.entries(initial.meta ?? {}));
  if (initial.settings) meta.set('settings', initial.settings);
  const snaps = new Map();
  const clone = (v) => structuredClone(v);
  return {
    kind: 'memory',
    async loadAll() {
      const raw = Object.fromEntries(RECORDS.map((s) => [s, clone([...records[s].values()])]));
      const split = splitMeta([...meta.entries()].map(([k, v]) => [k, clone(v)]));
      return { data: readRecords({ ...raw, settings: split.settings }).data, meta: split.meta };
    },
    async commit(changes) {
      const staged = RECORDS.flatMap((s) => (changes[s] ?? []).map((r) => [s, clone(r)])); // throws before writing anything
      for (const [s, r] of staged) records[s].set(r.id, r);
      if (changes.settings) meta.set('settings', clone(changes.settings));
      for (const [k, v] of Object.entries(changes.meta ?? {})) meta.set(k, clone(v));
    },
    async listSnapshots() {
      return [...snaps.values()].map((s) => s.info).sort((a, b) => a.at - b.at);
    },
    async saveSnapshot({ at, reason, version, data }) {
      const id = snapshotId(at);
      snaps.set(id, { info: { id, at, reason, version, counts: summarize(data) }, json: JSON.stringify(data) });
      return id;
    },
    async readSnapshot(id) {
      const s = snaps.get(id);
      return s ? readRecords(JSON.parse(s.json)).data : null;
    },
    async deleteSnapshots(ids) {
      for (const id of ids) snaps.delete(id);
    },
    close() {},
  };
}

export { emptyData };
