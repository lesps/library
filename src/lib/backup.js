// The backup file: everything in the library, deleted markers included, as one JSON document.
import { sanitizeBook } from './book.js';
import { sanitizeNote, sanitizeProgress, sanitizeCollection } from './records.js';
import { sanitizeSettings } from './settings.js';
import { mergeBook, emptyData } from './merge.js';
import { sanitizeRead, legacyReads } from './reads.js';
import { seriesFromTitle } from './series.js';
import { ymd } from './dates.js';

export const FORMAT = 'catalog-library';
export const VERSION = 2; // 2 (0.4): reads. Version 1 files keep read dates on books; readRecords converts them.
const READABLE = [1, 2];
const WEEK = 7 * 86_400_000;

export function exportData(data, now) {
  return {
    format: FORMAT,
    version: VERSION,
    exported: new Date(now).toISOString(),
    settings: data.settings,
    books: data.books,
    notes: data.notes,
    progress: data.progress,
    collections: data.collections,
    reads: data.reads,
  };
}

export const backupFilename = (now) => `catalog-${ymd(new Date(now))}.json`;

const SANITIZERS = { notes: sanitizeNote, progress: sanitizeProgress, collections: sanitizeCollection, reads: sanitizeRead };

// Validates every record (bad ones are skipped and counted); a repeated id keeps the newest copy.
// Data from before reads existed (version 1 backups, older safety copies) has no reads list: the
// read dates kept on its books become reads, with the same ids the database upgrade gives them.
// Titles still carrying a Goodreads series suffix (saved before 0.5) have it split off (series.js).
export function readRecords(input) {
  const raw = Array.isArray(input.reads) ? input : { ...input, reads: (Array.isArray(input.books) ? input.books : []).flatMap(legacyReads) };
  let skipped = 0;
  const books = new Map();
  for (const r of Array.isArray(raw.books) ? raw.books : []) {
    const clean = sanitizeBook(r);
    const b = clean && seriesFromTitle(clean);
    if (!b) skipped += 1;
    else books.set(b.id, books.has(b.id) ? mergeBook(books.get(b.id), b) : b);
  }
  const data = { ...emptyData(), books: [...books.values()], settings: sanitizeSettings(raw.settings) };
  for (const [kind, clean] of Object.entries(SANITIZERS)) {
    const byId = new Map();
    for (const r of Array.isArray(raw[kind]) ? raw[kind] : []) {
      const x = clean(r);
      if (!x) skipped += 1;
      else if (!byId.has(x.id) || x.updatedAt > byId.get(x.id).updatedAt) byId.set(x.id, x);
    }
    data[kind] = [...byId.values()];
  }
  return { data, skipped };
}

export function parseBackup(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'This file isn’t valid JSON.' };
  }
  if (!raw || raw.format !== FORMAT) return { ok: false, error: 'This isn’t a Catalog backup file.' };
  if (!READABLE.includes(raw.version)) return { ok: false, error: `This backup is version ${raw.version}, which this version of Catalog can’t read.` };
  if (!Array.isArray(raw.books)) return { ok: false, error: 'The backup has no books list.' };
  return { ok: true, ...readRecords(raw) };
}

export function summarize(data) {
  const books = data.books.filter((b) => !b.deleted);
  return {
    books: books.length,
    read: books.filter((b) => b.status === 'read').length,
    notes: data.notes.filter((n) => !n.deleted).length,
    collections: data.collections.filter((c) => !c.deleted).length,
    reads: (data.reads ?? []).filter((r) => !r.deleted && r.done).length,
  };
}

// Nudge for a file backup: there's something to lose and it changed since the last export,
// which was never or over a week ago.
export function backupDue({ lastExport, lastChange, bookCount }, now) {
  if (!bookCount || !lastChange) return false;
  if (lastExport == null) return true;
  return lastChange > lastExport && now - lastExport >= WEEK;
}
