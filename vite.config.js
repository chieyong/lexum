import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Lexum — Frans leren',
        short_name: 'Lexum',
        description: 'Woordjes en werkwoorden oefenen met spaced repetition',
        theme_color: '#0E0E10',
        background_color: '#0E0E10',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        runtimeCaching: [
          {
            // Supabase API — nooit cachen (auth tokens, live data)
            urlPattern: /^https:\/\/[a-z]+\.supabase\.co\/.*/i,
            handler: 'NetworkOnly',
          },
          {
            // Google Sheets — nooit cachen (live woordenlijst van ouder)
            urlPattern: /^https:\/\/docs\.google\.com\/.*/i,
            handler: 'NetworkOnly',
          },
          {
            // Cache Google Fonts
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ],
});
