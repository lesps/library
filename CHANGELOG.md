# Changelog

Each release's bullets are shown in the app's "What's new" note, so they're written for the person using Catalog. Notes for developers go under a "### Developer" heading, which the app skips.

## 0.6.1 — 2026-11-08

- Discover no longer deals several editions or translations of the same book. Titles are compared without subtitles, edition and imprint words or volume numbers, and authors are matched across spellings ("Dostoyevsky", "Dostoïevski") and name order ("Murakami Haruki"). Of several editions, it shows the one most readers have logged.
- Books that only exist in other languages on Open Library aren't dealt any more.
- Editions of books you already have, or have swiped on, stay out of the deck too.

### Developer

- `titleCore`, `authorsMatch` and a title + author book set in `src/lib/discover.js`; searches ask for `language`.

## 0.6.0 — 2026-11-08

- Discover: swipe through book recommendations on the Add tab. Right adds a book to Want to read, left passes, and Already read marks it read. Tap or swipe up to turn a card over for its description and why it was picked. Arrow keys work too.
- Recommendations come from your lanes: groups of the books you've liked, found from your authors, your shelves and each book's subjects. See them under Your lanes, deal from one lane, or mute one.
- Discover learns as you swipe: lanes you keep saying yes to deal more often, and books like the ones you pass on show up less. A wildcard every few cards keeps things from getting samey.
- More like this, on a card's details, deals a few more like that book right after it.
- The deck tops itself up while you're online and is kept for swiping offline.
- Changed your mind? Settings → Not interested lists the books you passed on, to restore one or clear them all.
- Catalog now fetches each book's subjects from Open Library in the background, along with its cover.
- A progress bar shows how far the background look-ups have got and roughly how long is left. They run while Catalog is open.
- Explore your reading (from Reading stats): when the books you've read were written, by century and then by decade, their themes, and your most-read authors. Tap any bar to see its books.
- Settings → Page counts lists the books with no page count. Type one in, or look them all up (Open Library, then Google Books). Reading stats links there when a year has books with no page count. Missing original publication years are filled in from Open Library too.
- Collections are listed A–Z everywhere. Prefer your own order? Choose My order on the Collections tab.

### Developer

- `src/lib/taste.js` (features, TF-IDF, average-linkage lanes, Rocchio and Thompson sampling, all recomputed from library + swipes), `src/lib/discover.js`, `views/discover.js`; swipe records (DB v3, backup v3); book fields `subjects`, `subjectsAt`; `settings.mutedLanes`, `settings.collectionOrder`; the deck in `meta.discover`. `src/lib/explore.js`, `views/explore.js`, `charts.js` `barList`, `progress.js`. The background worker merges per-book patches within a batch (a book looked up twice in one batch no longer loses the first result).

## 0.5.0 — 2026-11-07

- Series: books in a series now know it. Your Goodreads series come over from the titles ("The Way of Kings (The Stormlight Archive, #1)" becomes The Way of Kings, The Stormlight Archive #1), including books you've already imported.
- Each series has a page with its books in order. Open it from a book's series line, or from Series on the Collections tab.
- Find the rest: a series page can look up the whole series online and show the books you don't have in their places. Tick the ones you want and add them to Want to read in one go, in series order.
- Add a book from search and Catalog checks whether it starts (or continues) a series; if so, the result says "Add the rest".
- Set or fix a book's series in Edit details. The library can sort by series, and search finds books by series name.
- Books added without a page count get one along with their cover, when Open Library knows it.

### Developer

- `src/lib/series.js`, `views/series.js`; book fields `seriesName`, `seriesNumber`; `readRecords` splits Goodreads series suffixes off older titles (stamped with the title's own time); Wikidata SPARQL (`query.wikidata.org`) for series lookups; `source: 'wikidata'`.

## 0.4.0 — 2026-11-07

- Rereads: each time you read a book is now a read of its own, with its own dates. On a book's page, Reads lists them all; tap Start a reread to read it again, or Add a past read for one you remember.
- Notes can be about a particular read. While you're rereading, new notes go with that read, and a book's notes are grouped by read so you can compare what you noticed each time.
- Rereads count toward your reading goal, and the stats mark them.
- Your Goodreads read counts come over too: the latest Date Read becomes a dated read, and earlier reads Goodreads counted (but doesn't export dates for) appear as "Date unknown". Add a date to any of them to count it in its year.
- Your existing books and safety copies are converted automatically the first time this version opens.

### Developer

- `src/lib/reads.js`; database version 2 (a `reads` store, filled from books' old `started`/`finished`/`readCount` with deterministic ids); backup format version 2 (version 1 still reads); notes gain an optional `readId`.

## 0.3.0 — 2026-11-07

- Reading goals: set a goal for the year in books, pages or both. The Reading tab shows how far along you are, how many are left, and whether you're ahead of or behind an even pace.
- The To read tab is now Reading: what you're reading now, this year's goal, and your to-read list as Up next.
- Reading stats: books and pages by month and by year, average rating and length, longest and shortest, and every book you finished in a year. Your Goodreads history fills in past years on its own.
- Read books without a finish date are listed on the stats page, so you can add the date and count them.

### Developer

- `src/lib/stats.js` (year totals, history, pace), `settings.goals`, `src/ui/charts.js`, `views/reading.js`, `views/goal.js`, `views/stats.js`; the `queue` route is now `reading`.

## 0.2.0 — 2026-11-07

- Scan barcodes: on the Add tab, tap the barcode button and point your camera at the backs of your books, one after another. One book goes straight to its search result; several are looked up together so you can add them all at once.
- Scanning works offline too: the books are saved and their details fill in next time you're online.

### Developer

- `src/ui/scanner.js`, loaded on first use: the browser's BarcodeDetector where it reads EAN-13, otherwise the zxing WebAssembly decoder (`barcode-detector/ponyfill`), served from the site and cached by the service worker on first scan.

## 0.1.0 — 2026-11-07

Welcome to Catalog, a home for your books, looked after by cats.

- Import your Goodreads library: shelves become collections, private notes become notes, and your to-read order is kept. Importing a newer export later updates books instead of duplicating them.
- Find books by title, author or ISBN, or add them by hand when a search comes up empty. Paste a list of ISBNs or titles to add many at once.
- Select many books at once to change their status, add them to a collection, or delete them, with Undo.
- Track what you're reading by page or percent, rate books with paws, and keep dated notes with page numbers.
- Your to-read list is a queue you can reorder.
- Everything is stored on this device and works offline. Covers download in the background while you're online.
- Catalog keeps daily safety copies of your library on this device, and reminds you to save a backup file somewhere safe.

### Developer

- Vite + vanilla ES modules PWA, IndexedDB via `idb`, Vitest with `fake-indexeddb` and jsdom.
