// ISBN cleanup and checksums. Books are matched and looked up by ISBN-13.

export function cleanIsbn(s) {
  if (s == null) return '';
  return String(s).toUpperCase().replace(/[^0-9X]/g, '');
}

export function isIsbn10(s) {
  if (!/^\d{9}[\dX]$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += (s[i] === 'X' ? 10 : Number(s[i])) * (10 - i);
  return sum % 11 === 0;
}

const check13 = (twelve) => {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(twelve[i]) * (i % 2 ? 3 : 1);
  return String((10 - (sum % 10)) % 10);
};

export const isIsbn13 = (s) => /^\d{13}$/.test(s) && check13(s) === s[12];

export function toIsbn13(raw) {
  const s = cleanIsbn(raw);
  if (isIsbn13(s)) return s;
  if (isIsbn10(s)) {
    const twelve = `978${s.slice(0, 9)}`;
    return twelve + check13(twelve);
  }
  return '';
}

// A search box query that is an ISBN (any punctuation, an "isbn" prefix) → its ISBN-13; else null.
export function isbnFromQuery(q) {
  const s = String(q ?? '').replace(/^\s*isbn[:\s]*/i, '');
  if (/[^0-9xX\s-]/.test(s)) return null;
  return toIsbn13(s) || null;
}

export const formatIsbn = (isbn13) => (isbn13 ? `${isbn13.slice(0, 3)}-${isbn13.slice(3)}` : '');

// A scanned barcode → its ISBN-13, if it's a book's EAN-13 (978/979 "Bookland" prefix); else null.
export const isbnFromBarcode = (raw) => {
  const s = String(raw ?? '').trim();
  return /^97[89]\d{10}$/.test(s) && isIsbn13(s) ? s : null;
};
