// iOS launch screens ("apple-touch-startup-image"): iOS shows plain white while a Home Screen web
// app starts unless there's an image for the exact screen. One per iPhone screen size (portrait),
// light and dark. Sizes in CSS points; images are width × ratio by height × ratio pixels.
// iOS reads these only when the app is added to the Home Screen.

export const SPLASH_DEVICES = [
  { width: 440, height: 956, ratio: 3, models: '17 Pro Max, 16 Pro Max' },
  { width: 420, height: 912, ratio: 3, models: 'Air' },
  { width: 402, height: 874, ratio: 3, models: '17, 17 Pro, 16 Pro' },
  { width: 430, height: 932, ratio: 3, models: '16 Plus, 15 Plus, 15 Pro Max, 14 Pro Max' },
  { width: 393, height: 852, ratio: 3, models: '16, 15, 15 Pro, 14 Pro' },
  { width: 428, height: 926, ratio: 3, models: '14 Plus, 13 Pro Max, 12 Pro Max' },
  { width: 390, height: 844, ratio: 3, models: '17e, 16e, 14, 13, 13 Pro, 12, 12 Pro' },
  { width: 375, height: 812, ratio: 3, models: '13 mini, 12 mini, 11 Pro, XS, X' },
  { width: 414, height: 896, ratio: 3, models: '11 Pro Max, XS Max' },
  { width: 414, height: 896, ratio: 2, models: '11, XR' },
  { width: 414, height: 736, ratio: 3, models: '8 Plus, 7 Plus, 6s Plus' },
  { width: 375, height: 667, ratio: 2, models: 'SE (2nd/3rd gen), 8, 7, 6s' },
  { width: 320, height: 568, ratio: 2, models: 'SE (1st gen)' },
  { width: 669, height: 951, ratio: 3, models: 'Duo (inner screen)' },
  { width: 466, height: 678, ratio: 3, models: 'Duo (outer screen)' },
];

export const THEMES = {
  light: { background: '#e6efe9', shadow: 'rgb(20 40 34 / 0.12)' },
  dark: { background: '#0e1b17', shadow: 'rgb(0 0 0 / 0.35)' },
};

export const splashFile = ({ width, height, ratio }, theme) => `splash/${width}x${height}-${ratio}x-${theme}.png`;

const media = ({ width, height, ratio }, theme) =>
  `(device-width: ${width}px) and (device-height: ${height}px) and (-webkit-device-pixel-ratio: ${ratio}) and (orientation: portrait)`
  + (theme === 'dark' ? ' and (prefers-color-scheme: dark)' : '');

// Tags for Vite's transformIndexHtml; light first, dark (more specific) after.
export function splashLinks(base) {
  return ['light', 'dark'].flatMap((theme) => SPLASH_DEVICES.map((d) => ({
    tag: 'link',
    attrs: { rel: 'apple-touch-startup-image', media: media(d, theme), href: `${base}${splashFile(d, theme)}` },
    injectTo: 'head',
  })));
}

// The launch screen: the librarian cat on her book pile, a little above the middle, on the app's
// background. `cat` is a standalone 120-unit cat SVG (from src/lib/cats.js).
export function splashSvg({ width, height, ratio }, theme, cat) {
  const W = width * ratio;
  const H = height * ratio;
  const t = THEMES[theme];
  const size = Math.round(Math.min(W, H) * 0.42);
  const x = Math.round((W - size) / 2);
  const y = Math.round(H * 0.44 - size / 2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`
    + `<rect width="${W}" height="${H}" fill="${t.background}"/>`
    + `<ellipse cx="${W / 2}" cy="${y + size * 0.97}" rx="${size * 0.3}" ry="${size * 0.035}" fill="${t.shadow}"/>`
    + cat.replace('<svg ', `<svg x="${x}" y="${y}" width="${size}" height="${size}" `)
    + '</svg>';
}
