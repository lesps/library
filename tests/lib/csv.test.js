import { describe, it, expect } from 'vitest';
import { parseCsv, toCsv, csvObjects } from '../../src/lib/csv.js';

describe('parseCsv', () => {
  it('reads quoted fields with commas, escaped quotes and line breaks', () => {
    const text = 'a,b,c\r\n1,"x, y","say ""hi"""\n2,"line one\nline two",\n';
    expect(parseCsv(text)).toEqual([['a', 'b', 'c'], ['1', 'x, y', 'say "hi"'], ['2', 'line one\nline two', '']]);
  });

  it('ignores a byte-order mark and blank trailing lines', () => {
    expect(parseCsv('﻿a,b\n1,2\n\n')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('keeps an unterminated quote to the end instead of throwing', () => {
    expect(parseCsv('a\n"oops')).toEqual([['a'], ['oops']]);
  });
});

describe('csvObjects', () => {
  it('maps rows to objects by header, short rows padded with empty strings', () => {
    expect(csvObjects('Title,Author\nDune,Herbert\nEmma\n')).toEqual({ headers: ['Title', 'Author'], rows: [{ Title: 'Dune', Author: 'Herbert' }, { Title: 'Emma', Author: '' }] });
  });
});

describe('toCsv', () => {
  it('quotes only what needs it, and round-trips', () => {
    const rows = [['Title', 'Notes'], ['Dune', 'a, b'], ['Emma', 'she said "no"\nthen left'], ['=x', '']];
    const out = toCsv(rows);
    expect(out.split('\r\n')[1]).toBe('Dune,"a, b"');
    expect(parseCsv(out)).toEqual(rows);
  });
});
