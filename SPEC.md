# Catalog — spec

A personal library: the organizing half of Goodreads, without the social half. Import a Goodreads export, group books into collections, keep notes and reading progress, manage a to-read queue, add books by search or by hand. Installable PWA, no backend: everything lives on the device and works offline; the internet is only used to look books up and fetch covers. Cat-librarian theme throughout.

## Data

All records live in IndexedDB (database `catalog`, schema version 1). Memory holds the working copy: the app reads everything once at launch, and from then on every user action is applied in memory, rendered, and written as **one transaction** containing only the changed records.

### Book

```json
{
  "id": "uuid", "title": "Dune", "subtitle": "", "authors": ["Frank Herbert"], "authorSort": "Herbert, Frank",
  "isbn10": "", "isbn13": "9780441013593", "publisher": "Ace", "year": 1990, "originalYear": 1965,
  "pages": 412, "binding": "Paperback", "coverId": 12345, "coverUrl": "", "coverCheckedAt": 0, "olWork": "/works/OL893415W",
  "goodreadsId": "234225", "status": "read", "rating": 5, "review": "", "collectionIds": ["uuid"],
  "queueRank": "", "started": "2025-01-02", "finished": "2025-02-01", "readCount": 1, "owned": true,
  "needsLookup": false, "deleted": false,
  "source": "goodreads", "addedAt": 1762500000000, "fieldAt": { "title": 1762500000000, "…": 0 }, "updatedAt": 1762500000000
}
```

- `status`: `want` (want to read), `reading`, `read`, or `none`. Exactly one per book.
- Status changes carry their dates: entering `reading` stamps `started` with today; entering `read` stamps `finished` and adds one to `readCount`; entering `want` puts the book at the end of the queue.
- `collectionIds`: any number of collections.
- `queueRank`: the book's place in the to-read queue (see Ordering). Only meaningful while `status` is `want`.
- `rating`: 0 (unrated) to 5, shown as paws.
- `coverId`: an Open Library cover id; `coverUrl`: an https Google Books thumbnail. `coverCheckedAt`: when a cover look-up last found nothing (retried after 30 days).
- `needsLookup`: saved by ISBN while offline; `title` may be empty until the details arrive.
- `fieldAt`: when each field last changed. Every editable field has one, `deleted` included.
- `updatedAt`: the latest of `fieldAt`.
- Every field is sanitized on create, edit, load and import (bad ISBNs dropped, numbers range-checked, text trimmed and capped, unknown fields ignored). A record without an id, or without a title unless it's awaiting look-up, is skipped.

### Notes, progress, collections

```json
{ "id": "uuid", "bookId": "uuid", "text": "Fear is the mind-killer.", "page": 8, "at": 1762500000000, "updatedAt": 1762500000000 }
{ "id": "uuid", "bookId": "uuid", "page": 120, "percent": null, "at": 1762500000000, "updatedAt": 1762500000000 }
{ "id": "uuid", "name": "Sci-fi", "rank": "i", "updatedAt": 1762500000000 }
```

- A note is non-empty text with an optional page.
- A progress record is a page or a percent (0–100), never both. The book's current position is its latest live record. With a page count it shows as a percentage; at 100% a "Mark as read" button appears.
- Collection names are unique, ignoring case.
- Deleting a collection removes it from its books; the books stay.

### Deletion

Nothing is ever removed from storage. A delete sets `deleted: true` (books: through `fieldAt` like any field), so merging an older copy can't bring the record back. Deleted books are listed under Settings → Recently deleted and can be restored.

### Ordering

The to-read queue and the collection list are ordered by fractional ranks: base-36 strings that sort in list order. Moving one item gives it a rank between its new neighbours, so a move writes one record. A rank never ends in `0`, which guarantees there is always room between two ranks. Unranked or tied items are given evenly spaced ranks the first time one of them moves.

### Settings and device values

Stored in the `meta` object store:

- `settings`: `{ cats: 'lively' | 'subtle' | 'off', updatedAt }`. Travels with backups.
- Device-only, never in backups: `prefs` (library layout, sort, status and collection filters), `lastExport`, `backupSnoozedUntil`, `seenVersion`.

### Storage

| Store | Key | Holds |
| --- | --- | --- |
| `books`, `notes`, `progress`, `collections` | `id` | the records above |
| `meta` | name | settings and device values |
| `snapshots` | `id` | `{ id, at, reason, version, counts }` |
| `snapshotData` | `id` | `{ id, gz }` (gzipped JSON) or `{ id, json }` where compression isn't available |

- Schema changes are appended as migration steps; released steps are never edited.
- When another tab opens a newer version, this tab closes its connection and shows "Catalog was updated in another tab. Reload."
- If IndexedDB can't be opened (some private-browsing modes), the app runs from memory and Settings warns that nothing will be kept.
- If a write fails (for example, the device is out of space), a banner says changes are not being saved and offers Try again and Export backup. The failed changes are kept in memory and retried every 15 seconds and when the app goes to the background.
- After every successful write, a BroadcastChannel message tells other open tabs to reload from storage.
- The app calls `navigator.storage.persist()` at startup.

## Safety copies (snapshots)

Whole-library copies kept in IndexedDB on this device:

- A daily copy, taken at launch, hourly while open, and when the app goes to the background — but only if the library changed since the last copy and none was taken today.
- A copy before every import (`import`), bulk delete (`delete`), snapshot restore (`restore`) and backup merge (`merge`), and on request (`manual`).
- Kept: the newest copy of each of the last 7 days; the newest of each week back to about 5 weeks; and the 5 newest event copies from the last 30 days. Everything else is deleted after each new copy.
- **Restoring** turns the copy into ordinary edits stamped now: books and records go back to the copy's values, and anything created since is marked deleted. A restore therefore merges like any edit, and merging an older backup can't undo it.

Safety copies don't survive deleting the app or losing the device. Backup files do.

## Backup files

```json
{ "format": "catalog-library", "version": 1, "exported": "ISO time", "settings": {}, "books": [], "notes": [], "progress": [], "collections": [] }
```

- Everything, deleted markers included. Saved through the share sheet where available (iOS: Save to Files), otherwise downloaded. Named `catalog-YYYY-MM-DD.json`.
- **Merging** a backup: books merge field by field (the newer `fieldAt` wins; a tie keeps this device's value); notes, progress and collections merge whole on `updatedAt`; settings on their own `updatedAt`. Before merging, a dialog reports the new, updated and deleted books, and a safety copy is taken.
- Unreadable records are skipped and counted. A repeated id keeps the newest values.
- Changing this format means bumping `VERSION` in `src/lib/backup.js` and keeping version 1 readable.
- **Reminder**: the library shows "Save a backup file" when there are books and changes since the last export, and the last export was never or at least 7 days ago. Later hides it for 3 days.

## Goodreads

### Import

From Goodreads: My Books → Import and export → Export Library (desktop site only). The CSV columns used:

| Goodreads | Catalog |
| --- | --- |
| Book Id | `goodreadsId` (the re-import match key) |
| Title, Author, Additional Authors, Author l-f | `title`, `authors`, `authorSort` |
| ISBN, ISBN13 (written as `="…"`) | `isbn10`, `isbn13` (empty `=""` ignored) |
| My Rating, Publisher, Binding, Number of Pages, Year Published, Original Publication Year | `rating`, `publisher`, `binding`, `pages`, `year`, `originalYear` |
| Date Read, Date Added | `finished`, `addedAt` (noon local time on that day) |
| Exclusive Shelf | `status`: read → read, currently-reading → reading, to-read → want; a custom exclusive shelf → `none` plus a collection of that name |
| Bookshelves | collections (shelf slugs become names: `did-not-finish` → "Did not finish", `sci-fi` → "Sci-fi") |
| Bookshelves with positions | the to-read position, which orders the queue |
| My Review | `review` (HTML line breaks and entities turned into plain text) |
| Private Notes | a note |
| Read Count, Owned Copies | `readCount` (at least 1 for read books), `owned` |

- Rows without a title are skipped and counted.
- Matching, in order: Goodreads id, then ISBN-13, then title (ignoring leading articles) plus first author. Collections are reused by name, ignoring case.
- Matched books (when "Update books I already have" is on, the default) take Goodreads' status, read count, owned flag and id; its rating, finish date and review when Goodreads has one; and fill in ISBN, pages, publisher, years, format and author sort only where Catalog has none. Collections are added, never removed. A private note is added unless the book already has a note with the same text.
- New to-read books join the end of the queue in their Goodreads to-read order.
- The preview shows new books, updated books, unchanged books, new collections and notes. Import takes a safety copy first and writes everything in one transaction. Importing the same file twice changes nothing.

### Export

Settings → Export Goodreads CSV writes Goodreads' exact columns (`="…"` ISBNs, `yyyy/mm/dd` dates, shelves from collection names, `to-read (#n)` positions from the queue, notes joined into Private Notes), so Goodreads, StoryGraph and others can import it, and Catalog can re-import it. A selection can be exported the same way.

## Online look-ups

The only network use. Nothing about the library is sent anywhere except the search text, ISBN, or title and author being looked up.

- **Search** (Add tab): an ISBN (any punctuation, checksum-valid ISBN-10 or -13) searches by ISBN; anything else is a text search. Open Library first; Google Books when Open Library has nothing.
- Open Library results carry the ISBN only when searching by it: a work has many editions, and the others aren't known to be this one.
- Results already in the library (same ISBN-13, or same title and first author) say "In library" instead of Add.
- **Add as**: the status new books get (default Want to read).
- **Add by hand**: a form prefilled from the search box (an ISBN goes to the ISBN field, anything else to the title). Works offline.
- **Scan barcodes** (shown when the browser can use a camera): a camera view that keeps scanning until Done, reading the EAN-13 barcode on the back of a book (978/979 prefixes; checksum-checked; each ISBN once). With one book, its ISBN goes into the search box and is searched. With several, they're looked up like a pasted list. Offline, every scanned book is saved for later (skipping books already in the library). The browser's own BarcodeDetector is used where it reads EAN-13; otherwise (Safari, desktop Chrome on Linux and Windows) a ~950 KB WebAssembly decoder is loaded from this site on the first scan and cached by the service worker, so scanning works offline after that. If the camera is blocked, the view says so and suggests typing the ISBN.
- **Paste a list**: up to 200 lines, each an ISBN or title, looked up one by one. Matches are pre-ticked unless already in the library; Add adds the ticked ones.
- **Requests** go one at a time, at most one per 1.1 seconds per host (Open Library allows anonymous browser clients about one a second). Searches the person is waiting for go ahead of background work.
- **Background work**, while online: first, books saved for later (`needsLookup`) get their details; then books without a cover get one, newest first. Covers are looked up as Open Library cover ids and shown with `covers.openlibrary.org/b/id/{id}-{S|M|L}.jpg`. ISBN-keyed cover URLs are never used: Open Library limits them to 100 per 5 minutes per IP. A miss stamps `coverCheckedAt`; it's retried after 30 days, or straight away via the bulk action "Look for covers again". Results are saved in batches of six. A 403, 429 or 5xx pauses background work for 5 minutes.
- **Offline**: detected from the browser's online/offline events and from any failed request. Search, Paste a list and "Fill in from the web" are disabled with a note saying why. "Save ISBN for later" adds a placeholder book whose details fill in when the app is next online.
- **Scanner offline**: the decoder isn't part of the offline download; it's cached (`scanner` cache) the first time someone scans.
- **Covers offline**: the service worker caches cover images (cache-first, at most 500, kept a year, and the whole cache dropped first if storage runs short so covers can never crowd out the library). Covers that aren't cached show a generated cloth-bound cover with the title and author. Search API answers are never cached.

## Screens

Bottom tabs: **Library**, **To read**, **Add**, **Collections**, **Settings**.

- **Library**: search (title, subtitle, authors, ISBN, publisher, review and notes; every word must match; accents and case ignored), status chips with counts, a collection filter (or "In no collection"), sort (recently added, title ignoring articles, author surname, rating, date read, recently changed), grid or list. Layout, sort and filters are remembered. Only the rows on screen are drawn, so thousands of books scroll smoothly.
- **Select mode** (Select, or long-press a book): tap to toggle, shift-click for a range, "Select all N" for everything matching the current filters. Actions: Status, Collection (add to any, create a new one, remove from any the selection is in), Delete (asks first, takes a safety copy, Undo), More (look for covers again, export as Goodreads CSV). Done leaves select mode.
- **Book**: cover, title, authors, rating paws (tap the same paw to clear), status, started and finished dates, progress (page of N, or percent when the page count is unknown), collections (toggle, or create one), notes (dated, optional page, edit, delete with Undo), review, and a catalog card of details with Edit details, Fill in from the web (fills only empty fields) and Delete (Undo).
- **To read**: the queue in order. Drag a row by its handle, or use Top / Up / Down; Start moves a book to Reading.
- **Add**: see Online look-ups; also links to the Goodreads import.
- **Collections**: each with its book count and three covers; tap to open the library filtered to it. Rename, Move up/down, Delete. A link shows books in no collection.
- **Settings**: Save backup file, Merge a backup; Safety copies; Recently deleted; Goodreads import and export; Cats (Lively, A few, None); Covers status and Fetch now; What's new; Restart now when an update is waiting; Install on iPhone help.
- **Undo**: bulk status and collection changes, and deleting books, notes or collections, show a toast with Undo. Undo writes the old values back as new edits.

## Cats

- Drawn in code (`src/lib/cats.js`), never images: 6 poses (sitting, loaf, asleep, peeking over a book, reading, on a book pile) × 8 coats (ginger, brown tabby, gray, black, white, tuxedo, calico, Siamese) × eyes × accessory (round glasses, bow, scarf). Every cat comes from a seed, so it can be redrawn exactly.
- **Background**: a few cats are scattered behind each page and reshuffled every time the page changes. On wide screens they keep to the margins beside the content column. Settings: Lively (4 on a phone, 8 wide), A few (2/4), None. Text that sits directly on the page has a halo in the page colour, so it stays readable over them.
- **Perch**: one cat peeks over the top edge of the tab bar, at a random spot; hidden while selecting.
- **Mascots**: fixed cats for the empty library, empty queue, no results, offline, importing, done and missing-book states.
- All cats are `aria-hidden`.

## What's new

`CHANGELOG.md` is bundled. After an update, the notes for versions since the last one seen on this device appear once (up to 3). A first launch shows nothing. Settings → What's new reopens the latest, with earlier ones folded away.

## Updates

The service worker uses `registerType: 'prompt'`: a new version downloads in the background and takes over on the next launch, or immediately via Settings → Restart now. It never reloads the app mid-use.
