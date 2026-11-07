// Barcode scanning with the camera. Loaded only when someone taps Scan: it pulls in a ~1 MB
// decoder (zxing, WebAssembly) where the browser has no BarcodeDetector of its own (Safari).
// The decoder is served from this site and cached on first use, so scanning works offline after.
import { h, openDialog, closeDialog, plural } from './dom.js';
import { isbnFromBarcode, formatIsbn } from '../lib/isbn.js';
import { ICONS } from './icons.js';

const SCAN_EVERY = 220; // ms between decodes

async function createDetector() {
  const Native = globalThis.BarcodeDetector;
  if (Native) {
    try {
      if ((await Native.getSupportedFormats()).includes('ean_13')) return new Native({ formats: ['ean_13'] });
    } catch { /* fall back to the WebAssembly decoder */ }
  }
  const [{ BarcodeDetector, prepareZXingModule }, { default: wasmUrl }] = await Promise.all([
    import('barcode-detector/ponyfill'),
    import('zxing-wasm/reader/zxing_reader.wasm?url'),
  ]);
  prepareZXingModule({ overrides: { locateFile: (path, prefix) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) } });
  return new BarcodeDetector({ formats: ['ean_13'] });
}

// Opens a full-screen camera view that keeps scanning until Done; onDone(isbns) gets every
// distinct ISBN found, in scan order.
export async function openScanner({ onDone }) {
  const found = [];
  const video = h('video', { playsinline: true, muted: true, autoplay: true, 'aria-label': 'Camera' });
  const status = h('p', { class: 'scan-status', 'aria-live': 'polite' }, 'Starting the camera…');
  const list = h('ol', { class: 'scan-list' });
  const done = h('button', { type: 'button', class: 'btn primary', disabled: true }, 'Done');
  let stream = null;
  let timer = 0;
  let closed = false;

  const stop = () => {
    closed = true;
    clearTimeout(timer);
    stream?.getTracks().forEach((t) => t.stop());
  };
  const dlg = h('dialog', { class: 'scanner', 'aria-label': 'Scan barcodes' },
    h('div', { class: 'scan-frame' }, video, h('div', { class: 'scan-target', 'aria-hidden': 'true' })),
    status, list,
    h('div', { class: 'actions' },
      h('button', { type: 'button', class: 'btn ghost', onclick: () => { stop(); closeDialog(dlg); } }, 'Cancel'),
      done));
  done.addEventListener('click', () => { stop(); closeDialog(dlg); onDone([...found]); });
  dlg.addEventListener('close', stop);
  openDialog(dlg);

  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
  } catch (e) {
    status.textContent = e?.name === 'NotAllowedError'
      ? 'Camera access is blocked. Allow it for this site in your browser’s settings, or type the ISBN instead.'
      : 'No camera could be opened. Type the ISBN instead.';
    status.classList.add('error');
    return;
  }
  if (closed) { stop(); return; }
  video.srcObject = stream;
  let detector;
  try {
    status.textContent = 'Loading the barcode reader…';
    detector = await createDetector();
  } catch {
    stop();
    status.textContent = 'The barcode reader couldn’t load. Connect to the internet once so it can download, or type the ISBN.';
    status.classList.add('error');
    return;
  }
  status.textContent = 'Point the camera at the barcode on the back of a book.';

  const tick = async () => {
    if (closed) return;
    try {
      if (video.readyState >= 2) {
        for (const code of await detector.detect(video)) {
          const isbn = isbnFromBarcode(code.rawValue);
          if (!isbn || found.includes(isbn)) continue;
          found.push(isbn);
          navigator.vibrate?.(40);
          list.prepend(h('li', {}, h('span', { html: ICONS.check }), formatIsbn(isbn)));
          status.textContent = `${plural(found.length, 'book')} scanned. Keep going, or tap Done.`;
          done.disabled = false;
          done.textContent = `Done (${found.length})`;
        }
      }
    } catch { /* a frame that couldn't be read */ }
    timer = setTimeout(tick, SCAN_EVERY);
  };
  tick();
}
