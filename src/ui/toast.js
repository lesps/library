import { h } from './dom.js';

let current = null;

// One toast at a time; an optional action button (e.g. Undo) dismisses it.
export function toast(message, { action, onAction, duration = 5000 } = {}) {
  current?.remove();
  const el = h('div', { class: 'toast', role: 'status' },
    h('span', {}, message),
    action && h('button', { type: 'button', onclick: () => { el.remove(); onAction(); } }, action));
  document.body.append(el);
  current = el;
  setTimeout(() => el.remove(), duration);
  return el;
}
