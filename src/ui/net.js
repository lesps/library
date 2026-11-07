// Requests to the book services, one at a time and spaced out: Open Library allows browsers about one
// request a second. Searches the person is waiting on jump ahead of background cover fetching.

export class OfflineError extends Error {
  constructor() { super('offline'); this.name = 'OfflineError'; }
}

export class HttpError extends Error {
  constructor(status) { super(`HTTP ${status}`); this.name = 'HttpError'; this.status = status; }
}

export function createNet({ fetch = globalThis.fetch?.bind(globalThis), delay = (ms) => new Promise((r) => setTimeout(r, ms)), now = Date.now, gap = 1100 } = {}) {
  const queue = [];
  let busy = false;
  const last = new Map(); // host → time of the last request

  async function pump() {
    if (busy) return;
    busy = true;
    while (queue.length) {
      const i = queue.findIndex((j) => j.priority === 'user');
      const job = queue.splice(i < 0 ? 0 : i, 1)[0];
      const host = new URL(job.url).host;
      const wait = (last.get(host) ?? -Infinity) + gap - now();
      if (wait > 0) await delay(wait);
      last.set(host, now());
      try {
        let res;
        try {
          res = await fetch(job.url, { headers: { Accept: 'application/json' } });
        } catch {
          throw new OfflineError();
        }
        if (!res.ok) throw new HttpError(res.status);
        job.resolve(await res.json());
      } catch (e) {
        job.reject(e);
      }
    }
    busy = false;
  }

  return {
    get(url, { priority = 'user' } = {}) {
      if (!fetch) return Promise.reject(new OfflineError());
      return new Promise((resolve, reject) => {
        queue.push({ url, priority, resolve, reject });
        pump();
      });
    },
    get pending() { return queue.length; },
  };
}
