# CLAUDE.md

Catalog: an offline-first PWA for organizing a personal library (Goodreads import, collections, notes, progress, a to-read queue), with a cat-librarian theme. No backend; everything lives in IndexedDB on the device, with JSON backups, Goodreads CSV in and out, and on-device safety copies. Built in the same style as `lesps/banana`. `SPEC.md` describes behaviour and data formats and is kept accurate to the code.

## Stack
Vite 8 + vanilla ES modules (no framework), `idb` (IndexedDB promises), `barcode-detector` (zxing WebAssembly ponyfill, loaded only when scanning), `vite-plugin-pwa` (generateSW, `registerType: 'prompt'`), Vitest 5 + jsdom + `fake-indexeddb`, sharp (icon script only), `@fontsource/grandstander` (600/700, headings; body text is the system font).

## Commands
```bash
npm ci
npm test                              # tests/lib, tests/db, tests/ui (TZ=America/New_York, set in vitest.config.js)
npm run build && npm run test:build   # tests/build runs against dist/
npm run dev | npm run preview
npm run icons                         # app icons + iOS launch screens from the cat generator; commit public/ and assets/icon.svg
npm run cats -- out.html              # a page of every pose, coat and some random cats, for reviewing the art
BASE_PATH=/library/ npm run build     # sub-path build (CI sets /<repo-name>/)
```

## Layout
- `src/lib/` — pure logic, no DOM. (`isbn.js` also has `isbnFromBarcode`: EAN-13 with a 978/979 prefix.)
  - `book.js`: the book record. `BOOK_FIELDS` (field → sanitizer; `deleted` is a field; no read dates, those are reads; `seriesName`, `seriesNumber` as text), `createBook(fields, { now, id })`, `updateBook(book, patch, now)` (stamps only changed fields in `fieldAt`; same object when nothing changes; never blanks a title unless `needsLookup`), `sanitizeBook`, `authorLastFirst`, `authorSortKey`, `titleSortKey`, `bookAuthorSort`, `normalize` (re-exported by `library.js`), `newId`, `STATUS_LABELS`, `SOURCES`.
  - `reads.js`: reads (one per time through a book). `sanitizeRead`, `createRead`, `readsOf` (ordered), `openRead`, `completedReads`, `readCounts(reads)` (bookId → `{ count, last, open }`), `isReread`, `statusChange(book, reads, status, today, now, { endRank })` → `{ book, reads }` (every status change goes through it), `reconcileReads(bookId, reads, { count, finished, reading, started }, now)` (an import's or old book's read history → the missing reads, deterministic ids), `legacyReads(rawBook)` (pre-0.4 read fields → reads), `groupNotes(notes, reads, bookId)`.
  - `records.js`: notes (optional `readId`), progress, collections (`create*`, `sanitize*`, `touch(record, patch, now, sanitize)`), `currentProgress`, `progressPercent`, `findCollection` (case-insensitive, live only).
  - `merge.js`: `mergeBook` (field by field on `fieldAt`, ties keep local), `mergeData(local, incoming)` → `{ data, report: { added, updated, removed, unchanged, records } }`, `emptyData`, `KINDS` (`notes`, `progress`, `collections`, `reads`: merged whole on `updatedAt`).
  - `backup.js`: `exportData`, `parseBackup` (versions 1 and 2), `readRecords` (validate + dedupe; data without a `reads` list gets reads from its books' old read fields; titles with a Goodreads series suffix are split by `seriesFromTitle`; also used by the store on load and for safety copies), `summarize`, `backupDue`, `backupFilename`. `FORMAT`/`VERSION` (2).
  - `snapshots.js`: retention (`snapshotsToKeep`), `snapshotDue`, `dataVersion`, `restoreEdits(current, snapshot, now)` (a restore as new edits), `applyEdits(data, edits)` (write changed records over the library by id; used everywhere edits are applied in memory).
  - `undo.js`: `captureBefore(data, edits)`, `undoEdits(before, data, now)`.
  - `stats.js`: counts reads, not books. `yearStats(books, reads, year)` (`entries: [{ read, book, reread }]`, count, rereads, pages, unknown pages, averages, longest/shortest, `byMonth`), `yearsSummary(books, reads, currentYear)` (every year, gaps included), `undatedReads(books, reads)`, `pace({ goal, done, year, now })` → `{ status, by, toGo, daysLeft, perDay }`, `dayOfYear`, `daysInYear`. Rules in SPEC "Reading goals and stats".
  - `library.js`: `queryBooks` (filters, search incl. notes and series, `SORTS` incl. `series`; pass `reads` for the date-read sort), `statusCounts`, `toReadQueue`, `queueEndRank`, `findDuplicate` (ISBN-13, then title + first author), `normalize`.
  - `rank.js`: fractional ranks: `rankBetween(a, b)`, `spreadRanks(n, lo, hi)`.
  - `series.js`: `parseSeriesTitle` ("Mort (Discworld, #4)"), `seriesTitle` (back to Goodreads' form), `seriesLabel`, `seriesFromTitle(book)` (pre-0.5 records; stamps from the title's own `fieldAt`), `seriesKey`, `bySeriesNumber`, `booksInSeries`, `seriesList`; Wikidata: `wdFindSeriesUrl(book)` (by OL work, else title + author surname), `parseFoundSeries`, `pickSeries(found, knownName)`, `wdMembersUrl(id)`, `parseMembers` (one per book, in series order), `matchMember(books, member)`. Rules in SPEC "Series".
  - `goodreads.js`: `parseGoodreads(csv)` (splits series suffixes off titles), `planImport(rows, data, { now, updateExisting })` → `{ edits, collections, counts }`, `goodreadsCsv(data)` (puts them back), `shelfName`, `reviewText`. Rules in SPEC "Goodreads".
  - `csv.js` (RFC 4180 `parseCsv`, `csvObjects`, `toCsv`), `isbn.js` (`cleanIsbn`, checksums, `toIsbn13`, `isbnFromQuery`, `formatIsbn`), `dates.js` (local `YYYY-MM-DD` days, `parseLooseDate`, `formatDate`, `dayKey`, `weekKey`), `settings.js` (`sanitizeSettings`, `sanitizeGoals`), `changelog.js` (as Banana's).
  - `lookup.js`: URL builders and parsers for Open Library and Google Books (`olSearchUrl`, `parseOlSearch`, `googleSearchUrl`, `parseGoogle`, `coverLookupUrl`, `parseCoverLookup` (cover id, work, and pages when known)), `coverSrc` (cover-id URLs only), `needsCover`.
  - `cats.js`: the cat generator. `catSvg({ pose, coat, eyes, accessory, accent, flip, id, seed, ledge })` → static SVG markup (every internal id prefixed with `id`), `randomCat(rng)`, `rng(seed)` (mulberry32), `scatter(rng, { width, height, count, min, max })`, `POSES`, `COATS`, `EYES`, `ACCESSORIES`.
- `src/db/store.js`: `openStore({ name, onVersionChange })` and `createMemoryStore(initial)`, one interface: `loadAll()` → `{ data, meta }`, `commit(changes)` (one transaction; aborts on any error, including a put that throws synchronously), `listSnapshots`, `saveSnapshot`, `readSnapshot`, `deleteSnapshots`, `close`, `kind`. `MIGRATIONS` is append-only: step 1 (v1) the original stores, step 2 (v2, 0.4) the `reads` store plus converting books' old read fields inside the upgrade transaction. `DB_VERSION` 2.
- `src/ui/` — DOM.
  - `app.js`: `mountApp(root, { store, now, saveFile, fetch, isOnline, delay, env, version, changelog, workers, channel, catSeed, openScanner, win })` → `{ actions, state(), ready, destroy() }`. Owns state, hash routing (`#/library`, `#/book/<id>`, `#/reading`, `#/stats`, `#/add`, `#/collections`, `#/series/<name>`, `#/settings`, `#/import`, `#/snapshots`, `#/deleted`; `go(path)` uses pushState), whole-view rendering (focus and caret restored through `data-focus`; scroll remembered per route), the write queue (`edit()` → `applyEdits` in memory → render → `queueWrite`; failures kept and retried, banner shown), undo toasts, safety copies, the background worker (`runWorkers`: details for `needsLookup` books, then covers and missing page counts), series lookups on Wikidata (`state.series`: per-series lookup state, not saved; `findRest`, `pickRest`, `addRest`, `openSeries`; a single added book gets its series looked up in the background), and every action the views call. Storage keys are in `meta` (see SPEC).
  - `views/`: `library.js` (header, backup nudge, controls, windowed shelf, select mode and bulk bar; exports `stamp`, `paws`), `book.js` (exports `editDetails`, `readDates`, `readLabel`, `progressFor` (progress of the read in progress)), `reading.js` (the Reading tab: reading now, goal card, up next), `queue.js` (`queueSection`: the to-read queue with handle drag + buttons), `goal.js` (`goalCard(ctx, year, { compact })`, `editGoal`, `paceText`, `rate`), `stats.js` (the stats page), `series.js` (the series page: one shelf of the library's books and Wikidata's missing ones), `add.js`, `collections.js` (collections, then series), `import.js`, `settings.js` (also `snapshotsView`, `deletedView`). Each is `(ctx) → node`; `ctx = { state, actions, now, today, env, signal, afterRender }`.
  - `scanner.js` (dynamically imported by `actions.scan`; tests inject `openScanner`): `openScanner({ onDone })` opens the camera dialog and calls `onDone(isbns)`; `createDetector()` prefers the native BarcodeDetector, else the ponyfill with `prepareZXingModule` pointed at the bundled `zxing_reader.wasm?url`. `env.camera` (from `detectEnv`) decides whether the Scan button shows.
  - `charts.js`: `columnChart({ cls, caption, data: [{ key, axis, value, label, tip }], selected, onSelect })`: one series, thin rounded columns on one baseline, the tallest and selected columns labelled, each column `aria-label`led, a readout on hover/focus; with `onSelect` the columns are buttons and the rest go gray (`--chart-muted`).
  - `shelf.js`: windowed grid/list (`measure`, `shelf({ books, layout, selecting, renderItem, signal })` → `{ el, update }`; call `update` after mount, via `afterRender`).
  - `net.js`: `createNet({ fetch, delay, now, gap })` → `get(url, { priority })`: serial, ≥ `gap` ms per host, `user` before `background`; `OfflineError` for network failures, `HttpError` for bad statuses.
  - `cat-layer.js`: `createCatLayer(document)` → `shuffle(level, seed)` (background cats + the tab-bar perch), `mascot(kind)`, `MASCOTS`.
  - `cover.js`: `coverEl(book, { size, cls })` (generated cloth cover underneath, image on top, removed on error), `generatedCover`, `displayTitle`.
  - `dom.js`: `h()`, `openDialog`/`closeDialog` (fallback to the `open` attribute where `showModal` is missing, e.g. jsdom), `sheet`, `confirmDialog`, `promptDialog`, `formDialog`, `textDialog`, `plural`. `icons.js`, `toast.js`, `files.js` (`saveFile(name, text, type)`: share sheet, else download), `install.js`, `whats-new.js`.
- `src/main.js`: entry point (fonts, CSS, `navigator.storage.persist()`, SW registration). Untested by design; keep logic out of it.
- `src/styles.css`: tokens with light/dark themes. Background-cat opacity is `--cat-lively`/`--cat-subtle`. `main.view` gives text a halo in the page colour (cats wander behind); surfaces opt out with `text-shadow: none`. Generated covers are coloured by `--c`.
- `scripts/`: `build-icons.mjs` (icons from `LIBRARIAN`, launch screens), `splash.js` (iPhone sizes, `splashLinks` injected by a plugin in `vite.config.js`), `cat-sampler.mjs`.
- `tests/lib`, `tests/db` (`fake-indexeddb/auto`; each case runs against both stores), `tests/ui` (jsdom; `tests/ui/helpers.js` mounts with a memory store, a controllable clock, a fake fetch, a switchable online flag, a recording `saveFile`, `workers: false`), `tests/build` (separate config), `tests/fixtures/goodreads.csv`.
- `.github/workflows/deploy.yml`: test, build, build tests, deploy to GitHub Pages on push to `main` (Pages source must be "GitHub Actions").

## Rules
- TDD: write or update the failing test first. Flag any untested change.
- User text goes through `textContent` (the `h()` children). `h(..., { html })` is for static markup only (icons, cat art), never data.
- Never hard-delete records: deletion is `deleted: true` so merges can't resurrect them. Restores and undos are new edits stamped now.
- Every change to the library goes through `edit()` in `app.js`; never write to the store from a view.
- A store transaction never awaits anything but its own requests (it would auto-commit early). Compute first, then open the transaction.
- Schema changes are new entries at the end of `MIGRATIONS`; bump `DB_VERSION`. Never edit a released step. A migration that converts data must give converted records deterministic ids (see `reconcileReads`), so devices that upgrade separately still merge cleanly.
- Status changes go through `statusChange` (reads.js), never a bare `{ status }` patch, so reads stay in step.
- The barcode decoder must stay out of the main bundle and the precache (`tests/build` checks both); it's runtime-cached in the `scanner` cache.
- Covers are fetched by Open Library cover id, never by ISBN URL (rate-limited). Keep background requests on `priority: 'background'`.
- Series have no record of their own: a series is the books sharing `seriesName` (compared with `seriesKey`). Wikidata ids in SPARQL must be `Q` + digits (`parseFoundSeries` drops anything else).
- Changing the backup format means bumping `VERSION` in `backup.js` and keeping version 1 readable.
- Keep README, CHANGELOG, SPEC and this file accurate to the code.
- `CHANGELOG.md` is shown in the app. Every release bumps `version` in package.json and adds a `## x.y.z — date` section whose bullets are written for the person using Catalog; developer notes go under `### Developer`. `tests/lib/changelog.test.js` fails if the package version has no user-facing notes.
