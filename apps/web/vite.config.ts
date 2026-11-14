import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const API = process.env.VITE_API_PROXY ?? 'http://localhost:4000';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'icons/*.png'],
      manifest: {
        name: 'DigiScheme',
        short_name: 'DigiScheme',
        description: 'Find the government schemes you qualify for, in your own language.',
        theme_color: '#1F2761',
        background_color: '#F8FAFC',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The app shell and fonts work offline; scheme data is served stale-while-revalidate so the
        // catalogue stays readable with no network. Personal data and chat are never cached.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url, request }) => request.method === 'GET' && /^\/api\/(schemes|languages)/.test(url.pathname),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'digischeme-catalogue', expiration: { maxEntries: 80, maxAgeSeconds: 7 * 24 * 3600 } },
          },
        ],
      },
    }),
  ],
  server: { port: 5173, proxy: { '/api': { target: API, changeOrigin: true } } },
  preview: { port: 4173, proxy: { '/api': { target: API, changeOrigin: true } } },
  build: { sourcemap: false, chunkSizeWarningLimit: 900 },
});
