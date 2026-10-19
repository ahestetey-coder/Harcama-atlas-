import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { APP_CONFIG } from './src/config/app.ts'

export default defineConfig({
  base: './',
  plugins: [
    {
      name: 'app-name',
      transformIndexHtml: (html) => html.replaceAll('%APP_NAME%', APP_CONFIG.name),
    },
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: APP_CONFIG.name,
        short_name: APP_CONFIG.shortName,
        description: APP_CONFIG.description,
        lang: 'tr',
        theme_color: '#0b1220',
        background_color: '#0b1220',
        display: 'standalone',
        start_url: './',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Uygulama kabuğu ve PDF.js çalışanı ilk açılışta önbelleğe alınır.
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,woff2,json}'],
        globIgnores: ['ocr/**', 'pdfjs/**', 'ornek-dosyalar/**'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            // OCR motoru ve dil dosyaları: ilk kullanımda (veya Ayarlar'dan) indirilir, sonra çevrimdışı çalışır.
            urlPattern: ({ url }) => url.pathname.includes('/ocr/'),
            handler: 'CacheFirst',
            options: { cacheName: 'ocr-assets', expiration: { maxEntries: 20 } },
          },
          {
            urlPattern: ({ url }) => url.pathname.includes('/pdfjs/'),
            handler: 'CacheFirst',
            options: { cacheName: 'pdfjs-assets', expiration: { maxEntries: 300 } },
          },
        ],
      },
    }),
  ],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
  worker: { format: 'es' },
  server: { port: 5173, host: true },
})
