# Catalog

A personal library app, looked after by cats. The organizing half of Goodreads: your books, collections, notes, reading progress and a to-read queue, with nothing social. Installable, works offline, and keeps everything on your device.

**Live:** https://lesps.github.io/library/

- **Bring your Goodreads library.** Shelves become collections, private notes become notes, your to-read order is kept. Import a newer export later and books update instead of duplicating.
- **Add books** by title, author or ISBN (Open Library, then Google Books), by hand when a search comes up empty, or paste a list of ISBNs and titles to add many at once. Offline, save an ISBN and it fills in later.
- **Bulk changes.** Select many books (or long-press one) to change their status, add them to a collection, export them, or delete them, with Undo.
- **Reading.** Progress by page or percent, start and finish dates, ratings in paws, dated notes with page numbers, a review.
- **To-read queue** you can drag into order.
- **Cats.** Chibi cats drawn in code, reshuffled across the background of every page, one perched on the tab bar, and a librarian for the quiet moments. Lively, a few, or none.

## Install

- **iPhone/iPad**: open the link in Safari → Share → Add to Home Screen. The installed app keeps its own library, separate from Safari's, so install first, then import.
- **Android/desktop Chrome**: use the install button in the address bar or menu.

## Your data

Everything is stored on the device (IndexedDB) and works offline. The internet is used only to look books up and fetch covers: the search text, ISBN, or title and author being looked up go to Open Library or Google Books, and nothing else leaves the device.

Three layers keep it safe:

1. **Undo** after every destructive action, and **Recently deleted** for books.
2. **Safety copies** on the device: one a day for a week, one a week for a month, and one before every import, bulk delete, restore or merge. Restore from Settings → Safety copies.
3. **Backup files** you save somewhere off the device (Settings → Save backup file; on iPhone, save it to iCloud Drive). The app reminds you when one is due. Merging a backup keeps the newer of each change, field by field, so backups from two devices merge cleanly.

Settings also exports a Goodreads-format CSV that Goodreads, StoryGraph and others can import.

## Development

```bash
npm ci
npm test                              # unit, storage and UI tests
npm run build && npm run test:build   # build, then check dist/
npm run dev                           # local dev server
npm run icons                         # regenerate icons and iOS launch screens
```

Pushing to `main` runs the tests and deploys to GitHub Pages (Settings → Pages → Source must be **GitHub Actions**).

How it works: [`SPEC.md`](SPEC.md). Code map and rules: [`CLAUDE.md`](CLAUDE.md). Changes: [`CHANGELOG.md`](CHANGELOG.md).

Book data from [Open Library](https://openlibrary.org) and [Google Books](https://books.google.com).
