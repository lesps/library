import { mountApp } from '../../src/ui/app.js';
import { createMemoryStore } from '../../src/db/store.js';
import { createBook } from '../../src/lib/book.js';

export const at = (y, m, d, hh = 12, mm = 0) => new Date(y, m - 1, d, hh, mm).getTime();
export const T0 = at(2026, 11, 7, 12);

let n = 0;
export const book = (fields, now = T0) => createBook(fields, { now: now + n, id: `b${++n}` });

// A fake fetch: routes is [matcher(url) → json | Error | { status }]; records every URL asked for.
export function fakeFetch(routes = []) {
  const calls = [];
  const fn = async (url) => {
    calls.push(String(url));
    for (const [match, reply] of routes) {
      if (typeof match === 'string' ? String(url).toLowerCase().includes(match.toLowerCase()) : match(String(url))) {
        const r = typeof reply === 'function' ? reply(String(url)) : reply;
        if (r instanceof Error) throw r;
        if (r && typeof r.status === 'number') return { ok: r.status < 400, status: r.status, json: async () => ({}) };
        return { ok: true, status: 200, json: async () => r };
      }
    }
    return { ok: true, status: 200, json: async () => ({ docs: [], items: [] }) };
  };
  fn.calls = calls;
  return fn;
}

let current;

export async function mount({ time = T0, books = [], data = {}, meta = {}, online = true, fetch = fakeFetch(), store, ...opts } = {}) {
  current?.destroy();
  document.body.innerHTML = '<div id="app"></div>';
  window.location.hash = '';
  const root = document.getElementById('app');
  let t = time;
  const clock = { now: () => t, set: (v) => { t = v; }, advance: (ms) => { t += ms; } };
  const saved = [];
  const saveFile = async (name, text) => { saved.push({ name, text }); return true; };
  let isOnline = online;
  const net = { online: () => isOnline, set: (v) => { isOnline = v; window.dispatchEvent(new Event(v ? 'online' : 'offline')); } };
  const s = store ?? createMemoryStore({ books, ...data, meta });
  const app = (current = mountApp(root, {
    store: s, now: clock.now, saveFile, fetch, isOnline: net.online, delay: async () => {}, workers: false, channel: null, catSeed: () => 7, ...opts,
  }));
  await app.ready;

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];
  const button = (text, scope = document) => [...scope.querySelectorAll('button')].find((b) => b.textContent.trim() === text);
  const type = (sel, v) => {
    const el = typeof sel === 'string' ? $(sel) : sel;
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const change = (sel, v) => {
    const el = typeof sel === 'string' ? $(sel) : sel;
    if (el.type === 'checkbox' || el.type === 'radio') el.checked = v;
    else el.value = v;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const tab = (view) => $(`.tabs [data-view="${view}"]`).click();
  const titles = () => $$('.shelf .book .title').map((e) => e.textContent);
  const tick = async (k = 3) => { for (let i = 0; i < k; i++) await new Promise((r) => setTimeout(r, 0)); };
  const pickFile = async (sel, name, text) => {
    const input = $(sel);
    const file = new File([text], name, { type: 'text/plain' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await tick(6);
  };
  const stored = async () => (await s.loadAll()).data;
  const live = () => app.state().data.books.filter((b) => !b.deleted);
  return { root, app, clock, saved, net, fetch, store: s, $, $$, button, type, change, tab, titles, tick, pickFile, stored, live };
}
