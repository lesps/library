// Series: a book's seriesName and seriesNumber, grouping by series, and finding the rest of a series
// on Wikidata. Goodreads writes the series into the title ("Mort (Discworld, #4)"); that's split off
// on import and when older records are read, and put back on export.
import { titleSortKey, authorLastFirst, normalize } from './book.js';

const SUFFIX = /^(.*\S)\s*\(([^()]*?[^\s,()]),?\s+#(\d+(?:\.\d+)?(?:\s*-\s*\d+(?:\.\d+)?)?)(?:;[^()]*)?\)\s*$/;

// "The Way of Kings (The Stormlight Archive, #1)" → { title, name, number }; null when there's no suffix.
export function parseSeriesTitle(title) {
  const m = String(title ?? '').match(SUFFIX);
  return m ? { title: m[1].trim(), name: m[2].trim(), number: m[3].replace(/\s+/g, '') } : null;
}

export const seriesLabel = (b) => (b.seriesName ? `${b.seriesName}${b.seriesNumber ? ` #${b.seriesNumber}` : ''}` : '');

// The title as Goodreads writes it.
export const seriesTitle = (b) => (b.seriesName && b.seriesNumber ? `${b.title} (${b.seriesName}, #${b.seriesNumber})` : b.title);

// A record saved before series existed: the suffix moves out of the title, stamped with the title's
// own time rather than now, so devices that convert separately end up with identical records.
export function seriesFromTitle(b) {
  if (b.seriesName) return b;
  const p = parseSeriesTitle(b.title);
  if (!p) return b;
  const at = b.fieldAt?.title ?? 0;
  return { ...b, title: p.title, seriesName: p.name, seriesNumber: p.number, fieldAt: { ...b.fieldAt, title: at, seriesName: at, seriesNumber: at } };
}

export const seriesKey = (name) => normalize(name);

const numberOf = (n) => {
  const m = String(n ?? '').match(/^\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : Infinity;
};
export const bySeriesNumber = (a, b) => numberOf(a.seriesNumber) - numberOf(b.seriesNumber)
  || String(a.seriesNumber).localeCompare(String(b.seriesNumber))
  || titleSortKey(a.title).localeCompare(titleSortKey(b.title));

export function booksInSeries(books, name) {
  const key = seriesKey(name);
  return books.filter((b) => !b.deleted && b.seriesName && seriesKey(b.seriesName) === key).sort(bySeriesNumber);
}

// Every series with a live book, by name; each named as most of its books spell it.
export function seriesList(books) {
  const groups = new Map();
  for (const b of books) {
    if (b.deleted || !b.seriesName) continue;
    const key = seriesKey(b.seriesName);
    groups.set(key, [...(groups.get(key) ?? []), b]);
  }
  return [...groups].map(([key, list]) => {
    list.sort(bySeriesNumber);
    const spellings = new Map();
    for (const b of list) spellings.set(b.seriesName, (spellings.get(b.seriesName) ?? 0) + 1);
    const name = [...spellings].reduce((best, s) => (s[1] > best[1] ? s : best))[0];
    return { key, name, books: list };
  }).sort((a, b) => titleSortKey(a.name).localeCompare(titleSortKey(b.name)));
}

// ——— Wikidata ———
// The query service allows browsers (Access-Control-Allow-Origin: *). P179 is "part of the series",
// with the book's number as the P1545 qualifier; P648 is the Open Library id.
const WDQS = 'https://query.wikidata.org/sparql';
const LABELS = 'SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }';
const SERIES_TYPES = 'wd:Q277759 wd:Q1667921'; // book series, novel series: sub-series aren't books
const lit = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]+/g, ' ')}"`;
const sparqlUrl = (query) => `${WDQS}?${new URLSearchParams({ format: 'json', query: query.replace(/\s+/g, ' ').trim() })}`;
const entity = (v) => String(v ?? '').match(/\/(Q\d+)$/)?.[1] ?? '';
const val = (row, k) => (typeof row?.[k]?.value === 'string' ? row[k].value.trim() : '');

// The series a book belongs to: by its Open Library work when known, else by English title and
// the first author's surname.
export function wdFindSeriesUrl(book) {
  const work = String(book.olWork ?? '').match(/OL\d+W/)?.[0];
  let match;
  if (work) match = `?book wdt:P648 ${lit(work)} .`;
  else {
    const surname = authorLastFirst(book.authors?.[0] ?? '').split(',')[0].trim().toLowerCase();
    match = `?book rdfs:label ${lit(book.title)}@en .${surname
      ? ` ?book wdt:P50 ?author . ?author rdfs:label ?an . FILTER(LANG(?an) = "en" && CONTAINS(LCASE(?an), ${lit(surname)}))`
      : ''}`;
  }
  return sparqlUrl(`SELECT DISTINCT ?series ?seriesLabel ?ord WHERE {
    ${match}
    ?book p:P179 ?st . ?st ps:P179 ?series .
    OPTIONAL { ?st pq:P1545 ?ord }
    ${LABELS}
  } LIMIT 20`);
}

export function parseFoundSeries(json) {
  const rows = Array.isArray(json?.results?.bindings) ? json.results.bindings : [];
  const out = new Map();
  for (const r of rows) {
    const id = entity(val(r, 'series'));
    const name = val(r, 'seriesLabel');
    if (!id || !name || name === id || out.has(id)) continue;
    out.set(id, { id, name, number: val(r, 'ord') });
  }
  return [...out.values()];
}

// The series to use: the one already named on the book, else one that numbers it, else the first.
export function pickSeries(found, knownName = '') {
  const key = seriesKey(knownName);
  return (key && found.find((s) => seriesKey(s.name) === key)) || found.find((s) => s.number) || found[0] || null;
}

export function wdMembersUrl(seriesId) {
  return sparqlUrl(`SELECT ?book ?bookLabel ?ord ?ol ?date ?authorLabel WHERE {
    ?book p:P179 ?st . ?st ps:P179 wd:${seriesId} .
    OPTIONAL { ?st pq:P1545 ?ord }
    FILTER NOT EXISTS { ?book wdt:P629 ?work }
    FILTER NOT EXISTS { VALUES ?type { ${SERIES_TYPES} } ?book wdt:P31 ?type }
    OPTIONAL { ?book wdt:P648 ?ol }
    OPTIONAL { ?book wdt:P577 ?date }
    OPTIONAL { ?book wdt:P50 ?author }
    ${LABELS}
  } LIMIT 1000`);
}

// One entry per book (Wikidata gives a row per combination of ids, dates and authors), in series order;
// books without a number go last, oldest first. Books with no English title are left out.
export function parseMembers(json) {
  const rows = Array.isArray(json?.results?.bindings) ? json.results.bindings : [];
  const byId = new Map();
  for (const r of rows) {
    const id = entity(val(r, 'book'));
    const title = val(r, 'bookLabel');
    if (!id || !title || title === id) continue;
    const m = byId.get(id) ?? { id, title, number: '', olWork: '', year: null, authors: [] };
    m.number ||= val(r, 'ord');
    const ol = val(r, 'ol');
    if (!m.olWork && /^OL\d+W$/.test(ol)) m.olWork = `/works/${ol}`;
    const y = Number(val(r, 'date').match(/^-?\d{1,4}/)?.[0] ?? NaN);
    if (Number.isFinite(y) && (m.year == null || y < m.year)) m.year = y;
    const a = val(r, 'authorLabel');
    if (a && !/^Q\d+$/.test(a) && !m.authors.includes(a)) m.authors.push(a);
    byId.set(id, m);
  }
  return [...byId.values()].sort((a, b) => numberOf(a.number) - numberOf(b.number)
    || (a.year ?? Infinity) - (b.year ?? Infinity) || a.title.localeCompare(b.title));
}

// The library's copy of a series member, matched by Open Library work, then by title.
export function matchMember(books, m) {
  const live = books.filter((b) => !b.deleted);
  if (m.olWork) {
    const hit = live.find((b) => b.olWork === m.olWork);
    if (hit) return hit;
  }
  const key = normalize(titleSortKey(m.title));
  return live.find((b) => normalize(titleSortKey(b.title)) === key);
}
