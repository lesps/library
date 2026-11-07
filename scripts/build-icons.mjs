// App icons and iOS launch screens, all drawn from the cat generator. Run `npm run icons` and
// commit the output in public/.
import sharp from 'sharp';
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { catSvg } from '../src/lib/cats.js';
import { SPLASH_DEVICES, splashFile, splashSvg } from './splash.js';

const root = fileURLToPath(new URL('..', import.meta.url));
export const LIBRARIAN = { pose: 'stack', coat: 'ginger', accessory: 'glasses', eyes: 'happy', accent: '#5b4db8', seed: 3 };

// The icon: the librarian on a green tile. Maskable icons need a full-bleed background and the
// art inside the middle 80%.
export function iconSvg({ maskable = false } = {}) {
  const size = maskable ? 330 : 400;
  const x = (512 - size) / 2;
  const y = (512 - size) / 2 + (maskable ? 0 : 6);
  const cat = catSvg({ ...LIBRARIAN, id: 'icon' }).replace('<svg ', `<svg x="${x}" y="${y}" width="${size}" height="${size}" `);
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">'
    + `<rect id="bg" width="512" height="512"${maskable ? '' : ' rx="112"'} fill="#1e5a4c"/>`
    + `<circle cx="256" cy="262" r="${maskable ? 168 : 200}" fill="#2e7d69"/>`
    + cat + '</svg>';
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = [
    ['icon-192.png', iconSvg(), 192],
    ['icon-512.png', iconSvg(), 512],
    ['icon-maskable-512.png', iconSvg({ maskable: true }), 512],
    ['apple-touch-icon.png', iconSvg({ maskable: true }), 180],
  ];
  await mkdir(`${root}public/splash`, { recursive: true });
  await writeFile(`${root}assets/icon.svg`, iconSvg());
  await writeFile(`${root}public/favicon.svg`, iconSvg());
  for (const [name, src, size] of out) {
    await sharp(Buffer.from(src), { density: 300 }).resize(size, size).png({ compressionLevel: 9 }).toFile(`${root}public/${name}`);
    console.log(`public/${name}`);
  }
  const cat = catSvg({ ...LIBRARIAN, id: 'splash' });
  for (const device of SPLASH_DEVICES) {
    for (const theme of ['light', 'dark']) {
      const file = splashFile(device, theme);
      await sharp(Buffer.from(splashSvg(device, theme, cat))).png({ compressionLevel: 9, palette: true, quality: 90 }).toFile(`${root}public/${file}`);
    }
  }
  console.log(`public/splash/ (${SPLASH_DEVICES.length * 2} launch screens)`);
}
