import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { splashLinks } from './scripts/splash.js';

const base = process.env.BASE_PATH || '/';

export default defineConfig({
  base,
  plugins: [
    { name: 'ios-launch-screens', transformIndexHtml: () => splashLinks(base) },
    VitePWA({
      // New versions download in the background and wait; they take over on the next launch
      // (or when "Restart now" in Settings asks them to), never by reloading the app mid-use.
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Catalog',
        short_name: 'Catalog',
        description: 'Your personal library, looked after by cats. Works offline.',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        theme_color: '#e6efe9',
        background_color: '#e6efe9',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        globIgnores: ['splash/**'], // iOS reads launch screens only when the app is added
        cleanupOutdatedCaches: true,
        // Covers are kept for offline use. Capped, and dropped first if storage runs short, so they
        // can never crowd out the library itself (they may be opaque, which browsers count as large).
        runtimeCaching: [{
          urlPattern: ({ url }) => ['covers.openlibrary.org', 'books.google.com', 'books.googleusercontent.com'].includes(url.hostname),
          handler: 'CacheFirst',
          options: {
            cacheName: 'covers',
            expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 365, purgeOnQuotaError: true },
            cacheableResponse: { statuses: [0, 200] },
          },
        }],
      },
    }),
  ],
});
