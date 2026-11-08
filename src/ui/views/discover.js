import { h, plural } from '../dom.js';
import { ICONS } from '../icons.js';
import { coverEl } from '../cover.js';
import { mascot } from '../cat-layer.js';
import { DECK_LOW } from '../../lib/discover.js';
import { workerProgress } from '../progress.js';

// Search and Discover share the Add tab.
export const addModes = (actions, current) => h('div', { class: 'add-modes', role: 'tablist', 'aria-label': 'Ways to add books' },
  [['search', 'Search', '/add'], ['discover', 'Discover', '/discover']].map(([mode, label, path]) => h('button', {
    type: 'button', role: 'tab', 'data-mode': mode, 'aria-selected': String(mode === current), class: mode === current ? 'on' : '',
    onclick: () => { if (mode !== current) actions.go(path); },
  }, label)));

const bookTitles = (state, ids) => ids.map((id) => state.data.books.find((b) => b.id === id)).filter((b) => b && !b.deleted);
const and = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
const meta = (c) => [c.year, c.pages ? `${c.pages} pages` : null].filter(Boolean).join(' · ');

function cardFace(ctx, c, cls) {
  const why = bookTitles(ctx.state, c.why ?? []).map((b) => b.title);
  return h('article', { class: `card ${cls}`, 'data-work': c.work, 'aria-label': `${c.title} by ${c.authors.join(', ') || 'unknown author'}` },
    h('div', { class: 'dc-cover' }, coverEl({ title: c.title, authors: c.authors, coverId: c.coverId }, { size: 'L', cls: 'dc-img' })),
    h('div', { class: 'dc-body' },
      h('span', { class: `dc-lane${c.lane?.key === '*wildcard' ? ' wild' : ''}` }, c.lane?.label ?? ''),
      h('h2', { class: 'dc-title' }, c.title),
      h('p', { class: 'dc-author' }, c.authors.join(', ')),
      meta(c) ? h('p', { class: 'dc-meta' }, meta(c)) : null,
      why.length ? h('p', { class: 'dc-why' }, 'Because you liked ', ...why.flatMap((x, i) => [i ? ' and ' : '', h('cite', {}, x)])) : null),
    h('span', { class: 'stamp-hint want', 'aria-hidden': 'true' }, 'Want'),
    h('span', { class: 'stamp-hint no', 'aria-hidden': 'true' }, 'Pass'));
}

// Drag the top card: right keeps it, left passes, up turns it over; a tap turns it over too.
function swipeable(el, { onLeft, onRight, onUp }) {
  let start = null;
  const reset = () => {
    el.style.transform = '';
    el.classList.remove('dragging');
    delete el.dataset.hint;
  };
  el.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    start = { x: e.clientX, y: e.clientY };
    el.setPointerCapture?.(e.pointerId);
    el.classList.add('dragging');
  });
  el.addEventListener('pointermove', (e) => {
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    el.style.transform = `translate(${dx}px, ${Math.min(0, dy)}px) rotate(${dx / 20}deg)`;
    el.dataset.hint = dx > 60 ? 'want' : dx < -60 ? 'no' : '';
  });
  el.addEventListener('pointerup', (e) => {
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    start = null;
    if (dx > 100 || dx < -100) {
      el.classList.remove('dragging');
      el.classList.add(dx > 0 ? 'fly-right' : 'fly-left');
      setTimeout(dx > 0 ? onRight : onLeft, 160);
    } else if (dy < -90 || (Math.abs(dx) < 8 && Math.abs(dy) < 8)) {
      reset();
      onUp();
    } else reset();
  });
  el.addEventListener('pointercancel', () => { start = null; reset(); });
}

function actionBar(ctx, c) {
  const { actions } = ctx;
  const btn = (cls, label, icon, verdict) => h('button', {
    type: 'button', class: `deck-btn ${cls}`, 'aria-label': label, title: label,
    onclick: () => (verdict ? actions.swipe(c.work, verdict) : actions.openDetails(c.work)),
  }, h('span', { class: 'db-icon', html: icon }), h('span', { class: 'db-label' }, label));
  const details = ctx.state.discover.details === c.work;
  return h('div', { class: 'deck-actions' },
    btn('no', 'Not for me', ICONS.close, 'no'),
    btn('read', 'Already read', ICONS.check, 'read'),
    details ? null : btn('details', 'Details', ICONS.info, null),
    btn('want', 'Want to read', ICONS.heart, 'want'));
}

function details(ctx, c) {
  const { state, actions } = ctx;
  const why = bookTitles(state, c.why ?? []);
  const desc = c.description
    ? c.description.split(/\n{2,}/).map((p) => h('p', {}, p))
    : h('p', { class: 'muted' }, c.descriptionChecked ? 'Open Library has no description for this one.' : state.online ? 'Loading the description…' : 'The description wasn’t downloaded. It will load when you’re back online.');
  return h('article', { class: 'card card-details', 'data-work': c.work },
    h('div', { class: 'cd-head' },
      coverEl({ title: c.title, authors: c.authors, coverId: c.coverId }, { size: 'M', cls: 'cd-img' }),
      h('div', { class: 'cd-text' },
        h('span', { class: `dc-lane${c.lane?.key === '*wildcard' ? ' wild' : ''}` }, c.lane?.label ?? ''),
        h('h2', { class: 'dc-title' }, c.title),
        h('p', { class: 'dc-author' }, c.authors.join(', ')),
        meta(c) ? h('p', { class: 'dc-meta' }, meta(c)) : null)),
    h('div', { class: 'cd-description' }, desc),
    c.subjects?.length ? h('div', { class: 'cd-subjects' }, c.subjects.slice(0, 10).map((s) => h('span', { class: 'chip' }, s))) : null,
    h('section', { class: 'cd-why' },
      h('h3', {}, 'Why this'),
      h('p', { class: 'muted' }, c.lane?.key === '*wildcard'
        ? 'A wildcard: from a subject your books touch on that none of your lanes leads with.'
        : `From your ${c.lane?.label ?? ''} lane.${why.length ? ' It’s most like:' : ''}`),
      why.length ? h('div', { class: 'cd-like' }, why.map((b) => h('button', { type: 'button', class: 'cd-book', onclick: () => actions.go(`/book/${b.id}`) },
        coverEl(b, { size: 'S', cls: 'thumb' }), h('span', {}, b.title)))) : null),
    h('div', { class: 'cd-actions' },
      h('button', { type: 'button', class: 'btn small more-like', disabled: !state.online, onclick: () => actions.moreLike(c.work) }, 'More like this'),
      h('button', { type: 'button', class: 'btn small close-details', onclick: () => actions.closeDetails() }, 'Back to the card')),
    actionBar(ctx, c));
}

export function discoverView(ctx) {
  const { state, actions } = ctx;
  const d = state.discover;
  const t = actions.taste();
  const head = h('header', { class: 'top' }, h('h1', {}, 'Discover'),
    t.lanes.length ? h('div', { class: 'top-actions' }, h('button', { type: 'button', class: 'link lanes-link', onclick: () => actions.go('/lanes') }, 'Your lanes')) : null);
  if (!t.lanes.length) {
    return h('section', { class: 'discover-view' }, addModes(actions, 'discover'), head,
      h('div', { class: 'empty discover-empty' }, mascot('search', 'big'),
        h('h2', {}, 'Discover needs a few more books'),
        h('p', {}, 'Rate or finish a few books, or import your Goodreads library, and Discover will find more like the ones you love.')));
  }

  const deck = actions.deck();
  const c = deck[0];
  let stage;
  if (c && d.details === c.work) stage = details(ctx, c);
  else if (c) {
    const topCard = cardFace(ctx, c, 'top');
    swipeable(topCard, { onLeft: () => actions.swipe(c.work, 'no'), onRight: () => actions.swipe(c.work, 'want'), onUp: () => actions.openDetails(c.work) });
    stage = h('div', { class: 'deck' }, deck[1] ? cardFace(ctx, deck[1], 'next') : null, topCard);
  } else if (d.dealing) stage = h('div', { class: 'empty dealing' }, mascot('busy', 'big'), h('p', {}, 'Dealing cards…'));
  else {
    stage = h('div', { class: 'empty deck-empty' }, mascot(state.online ? 'done' : 'offline', 'big'),
      h('p', {}, state.online ? 'That’s the whole deck for now.' : 'You’ve seen every card. Discover deals more when you’re back online.'));
  }

  // Keys: → keep, ← pass, ↑ turn over, R already read, Esc back to the card.
  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.target?.closest?.('input, textarea, select, dialog')) return;
    const top = actions.deck()[0];
    if (!top) return;
    const open = state.discover.details === top.work;
    const act = { ArrowRight: () => actions.swipe(top.work, 'want'), ArrowLeft: () => actions.swipe(top.work, 'no'), r: () => actions.swipe(top.work, 'read'),
      ArrowUp: open ? null : () => actions.openDetails(top.work), Escape: open ? () => actions.closeDetails() : null }[e.key];
    if (!act) return;
    e.preventDefault();
    act();
  }, { signal: ctx.signal });

  const low = deck.length < DECK_LOW;
  const foot = h('div', { class: 'deck-foot' },
    h('span', { class: 'deck-count' }, `${plural(deck.length, 'card')} left${d.dealing ? ' · dealing…' : ''}`),
    low || !deck.length ? h('button', { type: 'button', class: 'btn small deal-more', disabled: !state.online || d.dealing, onclick: () => actions.dealCards({ priority: 'user' }) }, 'Deal more') : null,
    !state.online && low ? h('p', { class: 'muted' }, 'More cards need the internet.') : null,
    low && d.thin.length ? h('p', { class: 'muted thin' }, `Running low on ${and(d.thin)} picks.`) : null,
    d.error ? h('p', { class: 'error' }, d.error) : null,
    workerProgress(state, ctx.now(), { compact: true }));

  return h('section', { class: 'discover-view' }, addModes(actions, 'discover'), head, stage, c && d.details !== c.work ? actionBar(ctx, c) : null, foot);
}

export function lanesView(ctx) {
  const { state, actions } = ctx;
  const t = actions.taste();
  const waiting = actions.needingSubjects();
  return h('section', { class: 'lanes-view' },
    h('div', { class: 'detail-top' }, h('button', { type: 'button', class: 'icon-btn back', 'aria-label': 'Back', html: ICONS.back, onclick: () => actions.go('/discover') })),
    h('h1', {}, 'Your lanes'),
    h('p', { class: 'muted' }, 'Discover groups the books you’ve liked into lanes and deals from each. Lanes you keep saying yes to deal more often. Mute one to stop seeing it.'),
    waiting ? h('p', { class: 'note' }, `${plural(waiting, 'book')} still need${waiting === 1 ? 's' : ''} subjects. Lanes sharpen as they arrive.`) : null,
    workerProgress(state, ctx.now()),
    t.lanes.length ? h('ul', { class: 'lanes' }, t.lanes.map((l) => h('li', { class: `lane card${l.muted ? ' muted' : ''}` },
      h('div', { class: 'lane-head' }, h('h2', { class: 'lane-label' }, l.label), h('span', { class: 'lane-count' }, plural(l.books.length, 'book'))),
      h('div', { class: 'fan' }, l.books.slice(0, 5).map((b) => coverEl(b, { size: 'S', cls: 'thumb' }))),
      h('div', { class: 'chips' }, l.top.slice(0, 6).map((x) => h('span', { class: `chip ${x.type}` }, x.name))),
      l.yes + l.no >= 0.5 ? h('p', { class: 'muted small' }, `You’ve kept ${Math.round(l.yes)} and passed on ${Math.round(l.no)} from this lane.`) : null,
      h('div', { class: 'lane-actions' },
        h('button', { type: 'button', class: 'btn small deal-lane', disabled: !state.online || l.muted, onclick: () => actions.dealFromLane(l.key) }, 'Deal from this lane'),
        h('button', { type: 'button', class: 'btn small mute', 'aria-pressed': String(l.muted), onclick: () => actions.muteLane(l.key, !l.muted) }, l.muted ? 'Unmute' : 'Mute')))))
      : h('div', { class: 'empty' }, mascot('search'), h('p', {}, 'No lanes yet: rate or finish a few more books.')));
}
