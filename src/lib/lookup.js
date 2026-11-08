// Online book data: Open Library first, Google Books as the fallback. Only URLs and parsing live
// here; fetching (and rate limiting) is the UI's job. Covers are always fetched by Open Library
// cover id: cover URLs keyed by ISBN are limited to 100 per 5 minutes per IP.
import { isbnFromQuery, toIsbn13, cleanIsbn, isIsbn10 } from './isbn.js';
import { cleanSubjects } from './taste.js';

const OL = 'https://openlibrary.org/search.json';
const OL_FIELDS = 'key,title,subtitle,author_name,first_publish_year,cover_i,number_of_pages_median,publisher,subject,place,time';
const RETRY_MISS = 30 * 86_400_000;

export function olSearchUrl(query, { limit = 12 } = {}) {
  const isbn = isbnFromQuery(query);
  const p = new URLSearchParams(isbn ? { isbn } : { q: query.trim() });
  p.set('fields', OL_FIELDS);
  p.set('limit', String(isbn ? 3 : limit));
  return `${OL}?${p}`;
}

const str = (v) => (typeof v === 'string' ? v.trim() : '');
const year = (v) => {
  const m = String(v ?? '').match(/^-?\d{1,4}/);
  return m ? Number(m[0]) : null;
};

export function parseOlSearch(json, { isbn = '' } = {}) {
  const docs = Array.isArray(json?.docs) ? json.docs : [];
  return docs.filter((d) => str(d.title)).map((d) => ({
    title: str(d.title),
    subtitle: str(d.subtitle),
    authors: Array.isArray(d.author_name) ? d.author_name.map(str).filter(Boolean) : [],
    year: Number.isInteger(d.first_publish_year) ? d.first_publish_year : null,
    pages: Number.isInteger(d.number_of_pages_median) ? d.number_of_pages_median : null,
    publisher: Array.isArray(d.publisher) ? str(d.publisher[0]) : '',
    coverId: Number.isInteger(d.cover_i) && d.cover_i > 0 ? d.cover_i : null,
    olWork: str(d.key),
    isbn13: isbn, // a work has many editions; only the ISBN searched for is known to be right
    subjects: cleanSubjects([d.subject, d.place, d.time]),
    source: 'openlibrary',
  }));
}

export function googleSearchUrl(query) {
  const isbn = isbnFromQuery(query);
  const p = new URLSearchParams({ q: isbn ? `isbn:${isbn}` : query.trim(), maxResults: '12', printType: 'books' });
  return `https://www.googleapis.com/books/v1/volumes?${p}`;
}

export function parseGoogle(json) {
  const items = Array.isArray(json?.items) ? json.items : [];
  return items.map((it) => it?.volumeInfo ?? {}).filter((v) => str(v.title)).map((v) => {
    const ids = Array.isArray(v.industryIdentifiers) ? v.industryIdentifiers : [];
    const id = (type) => cleanIsbn(ids.find((x) => x?.type === type)?.identifier);
    const i10 = id('ISBN_10');
    const thumb = str(v.imageLinks?.thumbnail || v.imageLinks?.smallThumbnail);
    return {
      title: str(v.title),
      subtitle: str(v.subtitle),
      authors: Array.isArray(v.authors) ? v.authors.map(str).filter(Boolean) : [],
      year: year(v.publishedDate),
      pages: Number.isInteger(v.pageCount) && v.pageCount > 0 ? v.pageCount : null,
      publisher: str(v.publisher),
      isbn13: toIsbn13(id('ISBN_13') || i10),
      isbn10: isIsbn10(i10) ? i10 : '',
      coverUrl: thumb ? thumb.replace(/^http:/, 'https:').replace(/&edge=curl/, '') : '',
      source: 'google',
    };
  });
}

export function coverLookupUrl(book) {
  const p = new URLSearchParams(book.isbn13 ? { isbn: book.isbn13 } : { title: book.title, ...(book.authors[0] ? { author: book.authors[0] } : {}) });
  p.set('fields', 'key,cover_i,number_of_pages_median,first_publish_year,subject,place,time');
  p.set('limit', '1');
  return `${OL}?${p}`;
}

export function coverSrc(book, size = 'M') {
  if (book.coverId) return `https://covers.openlibrary.org/b/id/${book.coverId}-${size}.jpg`;
  return book.coverUrl || '';
}

// The background look-up: the best match's cover (the first result that has one), work, page count,
// first-published year and subjects. Subjects come from the work the cover came from, so they describe the same book.
export function parseBookLookup(json) {
  const docs = Array.isArray(json?.docs) ? json.docs : [];
  const d = docs.find((x) => Number.isInteger(x?.cover_i) && x.cover_i > 0) ?? docs[0];
  if (!d) return null;
  return {
    coverId: Number.isInteger(d.cover_i) && d.cover_i > 0 ? d.cover_i : null,
    olWork: str(d.key),
    pages: Number.isInteger(d.number_of_pages_median) && d.number_of_pages_median > 0 ? d.number_of_pages_median : null,
    year: Number.isInteger(d.first_publish_year) ? d.first_publish_year : null,
    subjects: cleanSubjects([d.subject, d.place, d.time]),
  };
}

export const needsSubjects = (b, now) => !b.deleted && !b.needsLookup && (!b.subjectsAt || (!b.subjects?.length && now - b.subjectsAt > RETRY_MISS));

export const needsCover = (b, now) => !b.deleted && !b.needsLookup && !b.coverId && !b.coverUrl && now - (b.coverCheckedAt ?? 0) > RETRY_MISS;
