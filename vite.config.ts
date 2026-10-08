import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

const DAY = 60 * 60 * 24

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      workbox: {
        clientsClaim: true,
        skipWaiting: true,
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => /(cmsassets\.rgpub\.io|tcgplayer-cdn\.tcgplayer\.com)$/.test(url.hostname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'card-images',
              expiration: { maxEntries: 600, maxAgeSeconds: 60 * DAY, purgeOnQuotaError: true },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Motor y modelo del OCR (Tesseract): unos MB que así solo se descargan una vez y funcionan sin conexión.
            urlPattern: ({ url }) => url.hostname === 'cdn.jsdelivr.net' && /tesseract/.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'ocr',
              expiration: { maxEntries: 20, maxAgeSeconds: 180 * DAY },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      manifest: {
        id: './', start_url: './', scope: './', lang: 'es',
        name: 'Foilio', short_name: 'Foilio',
        description: 'Escanea cartas de Riftbound, consulta su precio y gestiona tu colección y tus mazos',
        theme_color: '#6d4aff', background_color: '#0f1226', display: 'standalone', orientation: 'portrait',
        categories: ['games', 'utilities'],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
    }),
  ],
})
