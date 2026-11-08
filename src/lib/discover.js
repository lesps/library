// Discover: finding books to deal as cards. Candidates come from Open Library searches built from
// each lane's strongest features, are ranked by how close they sit to the lane (taste.js), and
// are dealt across lanes by Thompson sampling, with a wildcard every eighth card. Fetching is the
// UI's job; this is URLs, parsing and choosing.
import { normalize, titleSortKey } from './book.js';
import { cleanSubjects, bookFeatures, vectorize, cosine, betaSample } from './taste.js';

const OL = 'https://openlibrary.org';
export const PAGE_SIZE = 20;
export const DECK_LOW = 10; // top the deck up below this
export const DEAL_SIZE = 15;
export const WILDCARD = '*wildcard';
const WILDCARD_EVERY = 8;
const MIN_SCORE = 0.02;
const YEAR = 365 * 86_400_000;
const FIELDS = 'key,title,author_name,first_publish_year,number_of_pages_median,cover_i,subject,place,time,readinglog_count,description';

const quote = (s) => `"${String(s).replace(/"/g, '')}"`;

// A lane's searches: its main authors (other books by them are the surest bets) and its main
// subjects, together and alone. Ids are stable, so paging state survives a relaunch.
export function laneQueries(lane) {
  const authors = lane.top.filter((t) => t.type === 'author').slice(0, 2).map((t) => t.name);
  const subjects = lane.top.filter((t) => t.type === 'subject').slice(0, 2).map((t) => t.key.slice(2));
  const qs = [];
  if (subjects.length === 2) qs.push({ q: `subject:${quote(subjects[0])} AND subject:${quote(subjects[1])}`, sort: 'readinglog' });
  if (authors[0]) qs.push({ q: `author:${quote(authors[0])}`, sort: 'readinglog' });
  if (subjects[0]) qs.push({ q: `subject:${quote(subjects[0])}`, sort: 'rating' });
  if (authors[1]) qs.push({ q: `author:${quote(authors[1])}`, sort: 'readinglog' });
  if (subjects[1]) qs.push({ q: `subject:${quote(subjects[1])}`, sort: 'rating' });
  return qs.map((x) => ({ ...x, id: `${x.sort}|${x.q}` }));
}

// A wildcard search: a subject the reader's books have that no lane leads with.
export function wildcardQuery(taste, r) {
  const leading = new Set(taste.lanes.flatMap((l) => l.top.slice(0, 4).map((t) => t.key)));
  const df = new Map();
  for (const v of taste.vectors.values()) for (const k of v.keys()) if (k.startsWith('s:') && !leading.has(k)) df.set(k, (df.get(k) ?? 0) + 1);
  const options = [...df].filter(([, d]) => d >= 2).map(([k]) => k).sort();
  if (!options.length) return null;
  const s = options[Math.floor(r() * options.length)].slice(2);
  return { q: `subject:${quote(s)}`, sort: 'rating', id: `rating|subject:${quote(s)}` };
}

export function searchUrl({ q, sort }, page = 1) {
  const p = new URLSearchParams({ q, sort, fields: FIELDS, limit: String(PAGE_SIZE), page: String(page) });
  return `${OL}/search.json?${p}`;
}

export const workUrl = (work) => `${OL}${work}.json`;

// The query with the fewest pages fetched that still has results; cursors[id] is its next page.
export function nextQuery(queries, cursors = {}, exhausted = []) {
  let best = null;
  for (const query of queries) {
    if (exhausted.includes(query.id)) continue;
    const page = cursors[query.id] ?? 1;
    if (!best || page < best.page) best = { query, page };
  }
  return best;
}

// ——— parsing ———
const JUNK_TITLE = /\b(sparknotes|cliffs ?notes|study guide|summary (of|and analysis)|analysis of|critical (essays|companion|guide|edition)|companion to|reader'?s guide|teacher'?s guide|lesson plans?|colou?ring book|york notes|maxnotes|bloom'?s|quiz|workbook)\b/i;
const WORK = /^\/works\/OL\d+W$/;
const str = (v) => (typeof v === 'string' ? v.trim() : '');

// Open Library descriptions are Markdown-ish, often with a "([source][1])" note and link list.
export function cleanDescription(raw) {
  let s = typeof raw === 'string' ? raw : str(raw?.value);
  s = s.replace(/\r\n?/g, '\n').split(/\n\s*-{3,}/)[0];
  s = s.replace(/\(\[source\]\[\d+\]\)/gi, '').replace(/^\s*\[\d+\]:.*$/gm, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\[([^\]]+)\]\[\d+\]/g, '$1')
    .replace(/\*\*?([^*]+)\*\*?/g, '$1');
  s = s.split(/\n{2,}/).map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n\n');
  return s.length > 1500 ? `${s.slice(0, 1500)}…` : s;
}

export const parseWorkDescription = (json) => cleanDescription(json?.description);

export function parseDeal(json) {
  const docs = Array.isArray(json?.docs) ? json.docs : [];
  return docs.filter((d) => WORK.test(str(d?.key)) && str(d.title) && !JUNK_TITLE.test(d.title)).map((d) => ({
    work: d.key,
    title: str(d.title),
    authors: Array.isArray(d.author_name) ? d.author_name.map(str).filter(Boolean).slice(0, 3) : [],
    year: Number.isInteger(d.first_publish_year) ? d.first_publish_year : null,
    pages: Number.isInteger(d.number_of_pages_median) && d.number_of_pages_median > 0 ? d.number_of_pages_median : null,
    coverId: Number.isInteger(d.cover_i) && d.cover_i > 0 ? d.cover_i : null,
    subjects: cleanSubjects([d.subject, d.place, d.time]),
    readers: Number.isInteger(d.readinglog_count) ? d.readinglog_count : 0,
    description: cleanDescription(d.description),
  }));
}

// ——— ranking ———
const candidateFeatures = (c) => bookFeatures({ authors: c.authors, subjects: c.subjects, originalYear: c.year });
const titleKey = (t) => normalize(titleSortKey(t));
const authorKey = (a) => normalize(a?.[0] ?? '');

// Leaves out what the library has, what's in the deck, and books swiped on: "not for me" for a
// year, anything else for good. Matched by work, and by title and first author, since Open
// Library sometimes has the same book as two works.
const sameBook = (x) => `${titleKey(x.title)}|${authorKey(x.authors)}`;
function excluder({ books, swipes, deck, now }) {
  const works = new Set();
  const titles = new Set();
  const add = (work, x) => {
    if (work) works.add(work);
    titles.add(sameBook(x));
  };
  for (const b of books) if (!b.deleted) add(b.olWork, b);
  for (const c of deck) add(c.work, c);
  for (const s of swipes) if (!s.deleted && (s.verdict !== 'no' || now - s.at < YEAR)) add(s.work, s);
  return (c) => works.has(c.work) || titles.has(sameBook(c));
}

// Cards from a pool, best first: closeness to `target` (a lane's centre, or the whole profile),
// a little popularity, minus closeness to what the reader has turned down. Each card says which
// liked books it's most like ("Because you liked …") and keeps its features for the swipe record.
export function rankPool(pool, target, { taste, books, swipes = [], deck = [], now }) {
  const excluded = excluder({ books, swipes, deck, now });
  const seen = new Set();
  const out = [];
  for (const c of pool ?? []) {
    if (seen.has(c.work) || seen.has(sameBook(c)) || excluded(c)) continue;
    seen.add(c.work);
    seen.add(sameBook(c));
    const f = candidateFeatures(c);
    const v = vectorize(f, taste.idf);
    const pop = Math.min(1, Math.log10(1 + (c.readers ?? 0)) / 4);
    const score = cosine(v, target) + 0.15 * pop - (taste.anti?.size ? 0.5 * cosine(v, taste.anti) : 0);
    if (score <= MIN_SCORE) continue;
    const why = [...taste.vectors].map(([id, bv]) => ({ id, sim: cosine(v, bv), w: taste.weights.get(id) ?? 0 }))
      .filter((x) => x.sim > 0.05 && x.w >= 1).sort((a, b) => b.sim - a.sim || b.w - a.w).slice(0, 2).map((x) => x.id);
    out.push({ ...c, score, why, features: [...f.keys()] });
  }
  return out.sort((a, b) => b.score - a.score);
}

// Up to `count` cards from the pools (lane key → candidates, plus WILDCARD). Each card goes to a
// lane drawn by Thompson sampling: a draw from Beta(1 + yes, 1 + no) per lane, highest wins, so
// lanes the reader says yes to deal more, and quiet ones still deal now and then. Every eighth
// card is a wildcard, when there is one; muted lanes never deal.
export function deal(pools, count, ctx) {
  const { taste, rng: r, deck = [] } = ctx;
  const lanes = taste.lanes.filter((l) => !l.muted && pools.get(l.key)?.length).map((l) => ({ l, cards: rankPool(pools.get(l.key), l.centroid, ctx) }));
  const wild = rankPool(pools.get(WILDCARD), taste.profile, ctx);
  const taken = new Set();
  const isTaken = (c) => taken.has(c.work) || taken.has(sameBook(c));
  const take = (list) => {
    while (list.length && isTaken(list[0])) list.shift();
    return list.shift();
  };
  const out = [];
  while (out.length < count) {
    for (const x of lanes) while (x.cards.length && isTaken(x.cards[0])) x.cards.shift();
    while (wild.length && isTaken(wild[0])) wild.shift();
    const open = lanes.filter((x) => x.cards.length);
    let card;
    let lane;
    if (wild.length && ((deck.length + out.length) % WILDCARD_EVERY === WILDCARD_EVERY - 1 || !open.length)) {
      card = take(wild);
      lane = { key: WILDCARD, label: 'Wildcard' };
    } else if (open.length) {
      let best = null;
      let draw = -1;
      for (const x of open) {
        const d = betaSample(r, 1 + x.l.yes, 1 + x.l.no);
        if (d > draw) { draw = d; best = x; }
      }
      card = take(best.cards);
      lane = { key: best.l.key, label: best.l.label };
    }
    if (!card) break;
    taken.add(card.work);
    taken.add(sameBook(card));
    out.push({ ...card, lane });
  }
  return out;
}

// The cards still worth showing: not added to the library or swiped on since they were dealt.
export function stillFresh(cards, { books, swipes, now }) {
  const excluded = excluder({ books, swipes, deck: [], now });
  return cards.filter((c) => !excluded(c));
}

// A card the reader kept, as book fields.
export const cardToBook = (c, now) => ({
  title: c.title, authors: c.authors, olWork: c.work, originalYear: c.year, pages: c.pages, coverId: c.coverId, subjects: c.subjects, subjectsAt: now, source: 'openlibrary',
});
