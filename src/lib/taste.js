// Taste: what the library says about what its reader likes, for Discover.
//
// Each book becomes a weighted bag of features (authors, Open Library subjects, the reader's own
// collections, era), weighted by rarity across the library (TF-IDF) so "fiction" counts for nothing
// and "japanese fiction" counts a lot. Books are weighted by how much they were liked, then grouped
// into a few lanes (weighted spherical k-means: k-means on cosine similarity). Everything here is a
// pure function of the library and the swipe history, so it syncs and undoes with them and can be
// recomputed whenever the formula changes.
import { normalize } from './book.js';
import { readCounts } from './reads.js';

const YEAR = 365 * 86_400_000;
export const SUBJECT_LIMIT = 20;
export const MIN_BOOKS = 4; // liked books with something to go on, before there are lanes

// ——— subjects ———
// Open Library mixes library-system tags, bestseller lists and generic words in with real subjects.
const JUNK = /^(accessible book|protected daisy|in library|lending library|internet archive wishlist|overdrive|large type books|large print books|open library staff picks|popular print disabled|ebooks?|electronic books|reading level.*|staff picks|long now manual.*|book club.*|fiction|general|literature|novel|novels|translations?|translations into english|english language|english|readers|textbooks|juvenile (fiction|literature)|history and criticism|criticism and interpretation|criticism, interpretation, etc\.?|literary|classics?|classic literature|literary fiction|fiction in english|american fiction|english fiction|bestsellers?)$|nyt:|new york times|reviewed|award|collectionid|^[^a-z0-9]/;
const GENERIC = new Set(['fiction', 'general', 'literature', 'novel', 'novels', 'literary', 'juvenile fiction', 'juvenile literature', 'translations into english']);

function cleanOne(raw) {
  const s = normalize(raw).replace(/\.$/, '');
  if (s.length < 3 || s.length > 60 || JUNK.test(s)) return [];
  // Library of Congress style headings: "Russia -- Social life and customs -- 19th century".
  if (s.includes('--')) return s.split(/\s*--\s*/).flatMap(cleanOne);
  const parts = s.split(/\s*,\s*/).filter(Boolean);
  const kept = parts.filter((p) => !GENERIC.has(p));
  if (!kept.length) return [];
  // "Fiction, historical, general" → "historical fiction"
  if (parts[0] === 'fiction' && kept.length === 1) return [kept[0].endsWith('fiction') ? kept[0] : `${kept[0]} fiction`];
  const out = kept.join(', ');
  return JUNK.test(out) ? [] : [out];
}

// subject, place and time lists from Open Library → at most 20 cleaned subjects, first seen first.
export function cleanSubjects(lists) {
  const out = [];
  for (const list of lists) {
    for (const raw of Array.isArray(list) ? list : []) {
      if (typeof raw !== 'string') continue;
      for (const s of cleanOne(raw)) if (!out.includes(s)) out.push(s);
      if (out.length >= SUBJECT_LIMIT) return out.slice(0, SUBJECT_LIMIT);
    }
  }
  return out;
}

// ——— features ———
const TYPE_WEIGHT = { a: 1.4, s: 1, c: 1, e: 0.5 };
const typeOf = (key) => key[0];

export function eraOf(year) {
  if (!Number.isFinite(year)) return null;
  if (year < 500) return 'ancient';
  if (year < 1500) return 'medieval';
  if (year < 1900) return String(Math.floor(year / 100) * 100);
  return String(Math.floor(year / 50) * 50);
}

// Shelves that say how a book is held or how much it was liked, not what it's about.
const FAVOURITE = /^(all[- ]time[- ])?(favou?rites?|faves?|loved|best|5[- ]stars?|five[- ]stars?)$/;
const NOT_TOPICAL = /^(owned|own|books i own|my books|to[- ]buy|wish ?list|kindle|e-?books?|audio ?books?|audio|library|library books|borrowed|dnf|did[- ]not[- ]finish|abandoned|re-?reads?|to[- ]re-?read|gifts?|signed|physical|paperbacks?|hardcovers?|book[- ]club|read|to[- ]read|currently[- ]reading|[1-4][- ]stars?|(one|two|three|four)[- ]stars?|meh)$/;
export const shelfKind = (name) => (FAVOURITE.test(normalize(name)) ? 'favourite' : NOT_TOPICAL.test(normalize(name)) ? 'other' : 'topic');

// Only the main author: Goodreads lists translators and editors as additional authors.
const NO_AUTHOR = /^(anonymous|unknown|various|various authors|n\/a|anon\.?)$/;
const mainAuthor = (b) => {
  const a = normalize(b.authors?.[0] ?? '');
  return a && !NO_AUTHOR.test(a) ? a : '';
};

// Map feature key → type weight. `collections`: ids of live collections that describe what a book
// is about (only library books have them).
export function bookFeatures(b, collections = new Set()) {
  const f = new Map();
  if (mainAuthor(b)) f.set(`a:${mainAuthor(b)}`, TYPE_WEIGHT.a);
  for (const s of b.subjects ?? []) f.set(`s:${s}`, TYPE_WEIGHT.s);
  for (const c of b.collectionIds ?? []) if (collections.has(c)) f.set(`c:${c}`, TYPE_WEIGHT.c);
  const era = eraOf(b.originalYear ?? b.year);
  if (era) f.set(`e:${era}`, TYPE_WEIGHT.e);
  return f;
}

// A list of feature keys (as stored on a swipe) → the same weighted map.
export const featuresFromKeys = (keys) => new Map((keys ?? []).map((k) => [k, TYPE_WEIGHT[typeOf(k)] ?? 1]));

// How much a book says about the reader's taste: loved books pull hard, a 1-paw book pushes away.
// A book on a Favorites-style shelf counts as loved when it has no rating.
const BY_RATING = [1, -1, 0.3, 0.8, 1.5, 2];
export function bookWeight(b, counts = new Map(), favourites = new Set()) {
  if (!b || b.deleted) return 0;
  if (b.status === 'read') {
    const extra = Math.min(1, 0.5 * Math.max(0, (counts.get(b.id)?.count ?? 1) - 1));
    const loved = (b.collectionIds ?? []).some((c) => favourites.has(c));
    const base = b.rating ? BY_RATING[b.rating] : loved ? 2 : 1;
    return base < 0 ? base : base + extra;
  }
  return { reading: 1.2, want: 0.5 }[b.status] ?? 0.3;
}

export function vectorize(features, idf) {
  const v = new Map();
  let sq = 0;
  for (const [k, w] of features) {
    const x = w * (idf.get(k) ?? idf.get('*') ?? 1);
    v.set(k, x);
    sq += x * x;
  }
  const norm = Math.sqrt(sq) || 1;
  for (const [k, x] of v) v.set(k, x / norm);
  return v;
}

export function cosine(a, b) {
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [k, x] of small) dot += x * (big.get(k) ?? 0);
  return dot;
}

// Σ weight × vector, normalised; negative components dropped.
function centroid(items) {
  const c = new Map();
  for (const { v, w } of items) for (const [k, x] of v) c.set(k, (c.get(k) ?? 0) + w * x);
  let sq = 0;
  for (const [k, x] of c) {
    if (x <= 0) c.delete(k);
    else sq += x * x;
  }
  const norm = Math.sqrt(sq) || 1;
  for (const [k, x] of c) c.set(k, x / norm);
  return c;
}

export const swipeDecay = (s, now) => 0.5 ** (Math.max(0, now - s.at) / YEAR);

// ——— clustering ———
// Average-linkage agglomerative clustering: every liked book starts alone, and the two groups whose
// books are most alike on average merge, until no two groups are alike enough. Groups that share
// nothing never merge, and the number of lanes comes from the library itself. Books are weighted
// by liking (a weighted average, via the Lance–Williams update). Deterministic: ties go to the
// earlier book. O(n²) memory, so very large libraries cluster their best-liked books.
export const MAX_LANES = 12;
export const LINK = 0.15; // the least average similarity two groups need to merge
const CLUSTER_CAP = 1500;

function agglomerate(items, threshold) {
  const n = items.length;
  const S = Array.from({ length: n }, () => new Float32Array(n));
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) S[i][j] = S[j][i] = cosine(items[i].v, items[j].v);
  const W = items.map((it) => it.w);
  const alive = new Array(n).fill(true);
  const members = items.map((_, i) => [i]);
  const best = new Int32Array(n).fill(-1);
  const rowBest = (i) => {
    let b = -1;
    let s = -Infinity;
    for (let j = 0; j < n; j++) if (j !== i && alive[j] && S[i][j] > s) { s = S[i][j]; b = j; }
    best[i] = b;
  };
  for (let i = 0; i < n; i++) rowBest(i);
  for (;;) {
    let a = -1;
    let top = -Infinity;
    for (let i = 0; i < n; i++) if (alive[i] && best[i] >= 0 && S[i][best[i]] > top) { top = S[i][best[i]]; a = i; }
    if (a < 0 || top < threshold) break;
    const b = best[a];
    for (let k = 0; k < n; k++) {
      if (!alive[k] || k === a || k === b) continue;
      S[a][k] = S[k][a] = (W[a] * S[a][k] + W[b] * S[b][k]) / (W[a] + W[b]);
    }
    W[a] += W[b];
    members[a].push(...members[b]);
    alive[b] = false;
    for (let k = 0; k < n; k++) {
      if (!alive[k]) continue;
      if (k === a || best[k] === a || best[k] === b) rowBest(k);
      else if (S[k][a] > S[k][best[k]]) best[k] = a;
    }
  }
  return members.filter((_, i) => alive[i]);
}

const isTimeLike = (key) => /^s:.*(century|\d{4})/.test(key);
const TYPE_ORDER = { c: 0, s: 1, a: 2, e: 3 };

// Lanes: { key, label, centroid, books, top: [{ key, type, name }], weight, yes, no, muted }, biggest
// first. Also returns the overall profile (what the reader likes), the anti-profile (what they
// don't), and the idf table used, for scoring cards against.
export function findLanes(books, { reads = [], swipes = [], collections = [], now = Date.now(), muted = [], maxLanes = MAX_LANES, link = LINK } = {}) {
  const live = books.filter((b) => !b.deleted);
  const shelves = collections.filter((c) => !c.deleted);
  const topical = new Set(shelves.filter((c) => shelfKind(c.name) === 'topic').map((c) => c.id));
  const favourites = new Set(shelves.filter((c) => shelfKind(c.name) === 'favourite').map((c) => c.id));
  const names = new Map(shelves.map((c) => [`c:${c.id}`, c.name]));
  const counts = readCounts(reads);
  const feats = live.map((b) => {
    const f = bookFeatures(b, topical);
    const a = mainAuthor(b);
    if (a && !names.has(`a:${a}`)) names.set(`a:${a}`, b.authors[0]);
    return f;
  });

  const df = new Map();
  for (const f of feats) for (const k of f.keys()) df.set(k, (df.get(k) ?? 0) + 1);
  const N = live.length;
  const idf = new Map([...df].map(([k, d]) => [k, Math.log((N + 1) / (d + 1)) + 1]));
  idf.set('*', Math.log(N + 1) + 1); // a feature the library has never seen

  const all = live.map((b, i) => ({ b, v: vectorize(feats[i], idf), w: bookWeight(b, counts, favourites), info: [...feats[i].keys()].some((k) => typeOf(k) !== 'e') }));
  const liked = all.filter((it) => it.w > 0 && it.info);
  const activeSwipes = swipes.filter((s) => !s.deleted);
  const noes = activeSwipes.filter((s) => s.verdict === 'no').map((s) => ({ v: vectorize(featuresFromKeys(s.features), idf), w: swipeDecay(s, now), s }));
  const anti = centroid([...all.filter((it) => it.w < 0).map((it) => ({ v: it.v, w: -it.w })), ...noes.map((x) => ({ v: x.v, w: x.w * 0.7 }))]);
  const profile = centroid(liked);
  if (liked.length < MIN_BOOKS) return { lanes: [], profile, anti, idf, books: N };

  const pool = liked.length > CLUSTER_CAP ? [...liked].sort((x, y) => y.w - x.w).slice(0, CLUSTER_CAP) : liked;
  // Groups of fewer than 3 books aren't lanes; the biggest twelve (by liking) are.
  const groups = agglomerate(pool, link).filter((g) => g.length >= 3).map((g) => g.map((i) => pool[i]))
    .sort((x, y) => y.reduce((s, m) => s + m.w, 0) - x.reduce((s, m) => s + m.w, 0)).slice(0, maxLanes);

  const lanes = groups.map((members) => ({ c: centroid(members), members })).map(({ c, members }) => {
    const ranked = [...c].sort((a, b) => b[1] - a[1] || TYPE_ORDER[typeOf(a[0])] - TYPE_ORDER[typeOf(b[0])] || (a[0] < b[0] ? -1 : 1));
    const top = ranked.filter(([key]) => typeOf(key) !== 'e').slice(0, 8).map(([key]) => ({ key, type: { a: 'author', s: 'subject', c: 'collection' }[typeOf(key)], name: names.get(key) ?? key.slice(2).replace(/^./, (x) => x.toUpperCase()) }));
    // The label: the two strongest features, skipping "19th century"-like ones and, of two that
    // overlap ("japan", "japanese fiction"), keeping the longer.
    const labels = [];
    for (const t of [...top.filter((x) => !isTimeLike(x.key)), ...top.filter((x) => isTimeLike(x.key))]) {
      const low = t.name.toLowerCase();
      const clash = labels.findIndex((l) => l.name.toLowerCase().includes(low) || low.includes(l.name.toLowerCase()));
      if (clash >= 0) { if (low.length > labels[clash].name.length) labels[clash] = t; continue; }
      if (labels.length < 2) labels.push(t);
    }
    return {
      key: labels[0]?.key ?? top[0]?.key ?? 'lane',
      label: labels.map((l) => l.name).join(' · ') || 'Your books',
      centroid: c,
      books: [...members].sort((a, b) => b.w * cosine(b.v, c) - a.w * cosine(a.v, c)).map((m) => m.b),
      top,
      weight: members.reduce((s, m) => s + m.w, 0),
      yes: 0,
      no: 0,
    };
  }).sort((a, b) => b.weight - a.weight);

  // Keys stay unique, so muting one lane never mutes another.
  const seen = new Set();
  for (const l of lanes) {
    let key = l.key;
    for (let i = 2; seen.has(key); i++) key = `${l.key}#${i}`;
    l.key = key;
    seen.add(key);
    l.muted = muted.includes(key);
  }

  // Swipes count for the lane they're closest to now, so they survive lanes being recomputed.
  // "Not for me" also nudges its lane away from that card's features (a Rocchio update).
  for (const s of activeSwipes) {
    const v = vectorize(featuresFromKeys(s.features), idf);
    let lane = null;
    let sim = 0;
    for (const l of lanes) {
      const x = cosine(v, l.centroid);
      if (x > sim) { sim = x; lane = l; }
    }
    if (!lane) continue;
    const w = swipeDecay(s, now);
    if (s.verdict === 'no') {
      lane.no += w;
      lane.avoid = [...(lane.avoid ?? []), { v, w: w * 0.25 }];
    } else lane.yes += w + (s.peeked ? 0.25 : 0);
  }
  for (const l of lanes) {
    if (l.avoid) l.centroid = centroid([{ v: l.centroid, w: 1 }, ...l.avoid.map((x) => ({ v: x.v, w: -x.w }))]);
    delete l.avoid;
  }
  return { lanes, profile, anti, idf, books: N };
}

// ——— sampling ———
// Beta(a, b) from two Gamma draws (Marsaglia–Tsang), for Thompson sampling: each lane's chance
// of a good card is drawn from what its swipes say, so strong lanes deal more but none go silent.
function normal(r) {
  let u = 0;
  while (u === 0) u = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}
function gamma(r, a) {
  if (a < 1) return gamma(r, a + 1) * r() ** (1 / a);
  const d = a - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x;
    let v;
    do { x = normal(r); v = 1 + c * x; } while (v <= 0);
    v **= 3;
    const u = r();
    if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}
export function betaSample(r, a, b) {
  const x = gamma(r, a);
  return x / (x + gamma(r, b));
}
