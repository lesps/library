# Changelog

Each release's bullets are shown in the app's "What's new" note, so they're written for the person using Catalog. Notes for developers go under a "### Developer" heading, which the app skips.

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
