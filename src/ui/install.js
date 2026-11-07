import { h, openDialog } from './dom.js';

export function detectEnv(win = globalThis.window) {
  const nav = win?.navigator ?? {};
  const standalone = win?.matchMedia?.('(display-mode: standalone)').matches || nav.standalone === true;
  const ios = /iphone|ipad|ipod/i.test(nav.userAgent ?? '') || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
  const camera = typeof nav.mediaDevices?.getUserMedia === 'function';
  return { standalone: !!standalone, ios, camera };
}

export function showIosHelp() {
  document.querySelector('.ios-help')?.remove();
  const dlg = h('dialog', { class: 'ios-help', 'aria-labelledby': 'ios-help-title' },
    h('h2', { id: 'ios-help-title' }, 'Install on iPhone or iPad'),
    h('ol', {},
      h('li', {}, 'Tap the Share button (square with an arrow) in Safari.'),
      h('li', {}, 'Choose “Add to Home Screen”.'),
      h('li', {}, 'Tap Add. Catalog then opens full-screen and works offline.')),
    h('p', {}, 'The installed app keeps its own library, separate from Safari’s, so import your books after installing.'),
    h('form', { method: 'dialog' }, h('button', { class: 'btn primary', type: 'submit' }, 'Got it')));
  openDialog(dlg);
}
