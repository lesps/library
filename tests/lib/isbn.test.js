import { describe, it, expect } from 'vitest';
import { cleanIsbn, isIsbn10, isIsbn13, toIsbn13, isbnFromQuery, formatIsbn, isbnFromBarcode } from '../../src/lib/isbn.js';

describe('cleanIsbn', () => {
  it('strips hyphens, spaces and the Goodreads ="…" wrapper', () => {
    expect(cleanIsbn('978-0-14-032872-1')).toBe('9780140328721');
    expect(cleanIsbn('="0451526538"')).toBe('0451526538');
    expect(cleanIsbn('=""')).toBe('');
    expect(cleanIsbn(' 0-8044-2957-x ')).toBe('080442957X');
    expect(cleanIsbn(null)).toBe('');
  });
});

describe('checksums', () => {
  it('validates ISBN-10, X included', () => {
    expect(isIsbn10('0451526538')).toBe(true);
    expect(isIsbn10('080442957X')).toBe(true);
    expect(isIsbn10('0451526539')).toBe(false);
    expect(isIsbn10('045152653')).toBe(false);
  });

  it('validates ISBN-13', () => {
    expect(isIsbn13('9780140328721')).toBe(true);
    expect(isIsbn13('9780140328722')).toBe(false);
    expect(isIsbn13('978014032872X')).toBe(false);
  });
});

describe('toIsbn13', () => {
  it('converts a valid ISBN-10 and passes a valid ISBN-13 through', () => {
    expect(toIsbn13('0451526538')).toBe('9780451526533');
    expect(toIsbn13('080442957X')).toBe('9780804429573');
    expect(toIsbn13('9780140328721')).toBe('9780140328721');
  });

  it('returns empty for anything invalid', () => {
    expect(toIsbn13('12345')).toBe('');
    expect(toIsbn13('9780140328722')).toBe('');
  });
});

describe('isbnFromQuery', () => {
  it('recognizes an ISBN typed or pasted with punctuation', () => {
    expect(isbnFromQuery('978-0-14-032872-1')).toBe('9780140328721');
    expect(isbnFromQuery('isbn 0451526538')).toBe('9780451526533');
  });

  it('treats titles and invalid numbers as text', () => {
    expect(isbnFromQuery('The Hobbit')).toBe(null);
    expect(isbnFromQuery('1984')).toBe(null);
    expect(isbnFromQuery('9780140328722')).toBe(null);
  });
});

describe('formatIsbn', () => {
  it('shows ISBN-13 in readable groups of prefix and the rest', () => {
    expect(formatIsbn('9780140328721')).toBe('978-0140328721');
    expect(formatIsbn('')).toBe('');
  });
});

describe('isbnFromBarcode', () => {
  it('reads the EAN-13 barcode on the back of a book (978/979 prefixes)', () => {
    expect(isbnFromBarcode('9780140328721')).toBe('9780140328721');
    expect(isbnFromBarcode('9791032305690')).toBe('9791032305690');
  });

  it('ignores price add-ons, product barcodes and misreads', () => {
    expect(isbnFromBarcode('51299')).toBe(null);
    expect(isbnFromBarcode('0012345678905')).toBe(null);
    expect(isbnFromBarcode('9780140328722')).toBe(null);
    expect(isbnFromBarcode('')).toBe(null);
  });
});
