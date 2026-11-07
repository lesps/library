import { h, plural } from '../dom.js';
import { ICONS } from '../icons.js';
import { coverEl, displayTitle } from '../cover.js';
import { mascot } from '../cat-layer.js';
import { toReadQueue } from '../../lib/library.js';

// Drag a row by its handle; the others slide to show where it will land.
function draggable(row, list, index, onDrop) {
  const handle = row.querySelector('.handle');
  handle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    handle.setPointerCapture?.(e.pointerId);
    const rows = [...list.children];
    const height = row.offsetHeight || 72;
    const startY = e.clientY;
    let target = index;
    row.classList.add('dragging');
    const move = (ev) => {
      const dy = ev.clientY - startY;
      row.style.transform = `translateY(${dy}px)`;
      target = Math.max(0, Math.min(rows.length - 1, index + Math.round(dy / height)));
      rows.forEach((r, i) => {
        if (r === row) return;
        const shift = i > index && i <= target ? -height : i < index && i >= target ? height : 0;
        r.style.transform = shift ? `translateY(${shift}px)` : '';
      });
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      rows.forEach((r) => { r.style.transform = ''; });
      row.classList.remove('dragging');
      if (target !== index) onDrop(target);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up, { once: true });
    handle.addEventListener('pointercancel', up, { once: true });
  });
}

// "Up next": the to-read queue, in order, as a section of the Reading tab.
export function queueSection({ state, actions }) {
  const queue = toReadQueue(state.data.books);
  const head = h('h2', {}, 'Up next', queue.length ? h('span', { class: 'total' }, ` ${plural(queue.length, 'book')}`) : null);
  if (!queue.length) {
    return h('section', { class: 'up-next' }, head,
      h('div', { class: 'queue-empty' }, mascot('queue', 'small'),
        h('p', {}, 'Nothing on your to-read list. Books you mark “Want to read” line up here, in the order you want to read them.'),
        h('button', { type: 'button', class: 'btn small', onclick: () => actions.go('/add') }, 'Find a book')));
  }
  const list = h('ol', { class: 'queue' });
  queue.forEach((b, i) => {
    const icon = (cls, label, svg, onclick, disabled) => h('button', { type: 'button', class: `icon-btn ${cls}`, 'aria-label': label, html: svg, disabled, onclick });
    const row = h('li', { class: 'qitem', 'data-id': b.id },
      h('span', { class: 'handle', 'aria-hidden': 'true', html: ICONS.grip }),
      h('span', { class: 'q-num' }, String(i + 1)),
      h('button', { type: 'button', class: 'q-book', onclick: () => actions.go(`/book/${b.id}`) },
        coverEl(b, { size: 'S', cls: 'thumb' }),
        h('span', { class: 'q-text' }, h('span', { class: 'q-title' }, displayTitle(b)), h('span', { class: 'q-author' }, b.authors.join(', ')))),
      h('div', { class: 'q-actions' },
        icon('top', `Move ${b.title} to the top`, ICONS.top, () => actions.moveInQueue(b.id, 0), i === 0),
        icon('up', `Move ${b.title} up`, ICONS.up, () => actions.moveInQueue(b.id, i - 1), i === 0),
        icon('down', `Move ${b.title} down`, ICONS.down, () => actions.moveInQueue(b.id, i + 1), i === queue.length - 1),
        h('button', { type: 'button', class: 'btn small start', onclick: () => actions.setStatus(b.id, 'reading') }, 'Start')));
    draggable(row, list, i, (to) => actions.moveInQueue(b.id, to));
    list.append(row);
  });
  return h('section', { class: 'up-next' }, head,
    h('p', { class: 'muted small' }, 'Drag the handle, or use the arrows, to put them in order.'),
    list);
}
