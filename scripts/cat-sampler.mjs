// Writes cat-sampler.html: every pose and coat, plus a page of random cats, for reviewing the art.
import { writeFile } from 'node:fs/promises';
import { catSvg, randomCat, rng, POSES, COATS } from '../src/lib/cats.js';

const out = process.argv[2] ?? 'cat-sampler.html';
const cell = (svg, label) => `<figure>${svg}<figcaption>${label}</figcaption></figure>`;
const poses = POSES.map((pose, i) => cell(catSvg({ pose, coat: 'ginger', accessory: i % 2 ? 'glasses' : 'none', id: `p${i}` }), pose)).join('');
const coats = Object.keys(COATS).map((coat, i) => cell(catSvg({ pose: 'sit', coat, eyes: i % 3 === 1 ? 'happy' : 'open', id: `c${i}` }), coat)).join('');
const r = rng(2026);
const random = Array.from({ length: 24 }, (_, i) => {
  const c = randomCat(r);
  return cell(catSvg({ ...c, id: `r${i}`, seed: i + 1 }), `${c.coat} · ${c.pose}${c.accessory === 'none' ? '' : ` · ${c.accessory}`}`);
}).join('');

await writeFile(out, `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cat sampler</title>
<style>
  body { margin: 0; padding: 16px; font: 14px/1.4 system-ui, sans-serif; background: #eaf1ec; color: #22302b; }
  h2 { font-size: 16px; margin: 20px 0 8px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 8px; }
  figure { margin: 0; background: #fff; border-radius: 14px; padding: 6px 6px 4px; text-align: center; }
  figure svg { width: 100%; height: auto; display: block; }
  figcaption { font-size: 11px; color: #5d6b66; }
</style>
<h2>Poses</h2><div class="grid">${poses}</div>
<h2>Coats</h2><div class="grid">${coats}</div>
<h2>Random draws</h2><div class="grid">${random}</div>`);
console.log(out);
