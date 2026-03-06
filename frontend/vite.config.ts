import path from 'path'
import { defineConfig } from 'vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import wasm from 'vite-plugin-wasm'

export default defineConfig({
  define: {
    // Expose CI to app so we can disable dev overlays (e.g. TanStack Router Devtools)
    // that intercept pointer events and break E2E tests.
    'import.meta.env.CI': JSON.stringify(!!process.env.CI),
  },
  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
      routeFileIgnorePattern: '__tests__',
    }),
    react(),
    tailwindcss(),
    wasm(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Bitboard Wallet',
        short_name: 'Bitboard',
        description: 'A Progressive Web App Bitcoin wallet',
        theme_color: '#1a1a2e',
        background_color: '#1a1a2e',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,wasm}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/esplora-proxy/signet': {
        target: 'https://mempool.space',
        changeOrigin: true,
        secure: true,
        rewrite: (path) =>
          path.replace(/^\/esplora-proxy\/signet/, '/signet/api'),
      },
      '/esplora-proxy/testnet': {
        target: 'https://mempool.space',
        changeOrigin: true,
        secure: true,
        rewrite: (path) =>
          path.replace(/^\/esplora-proxy\/testnet/, '/testnet/api'),
      },
      '/esplora-proxy/mainnet': {
        target: 'https://mempool.space',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/esplora-proxy\/mainnet/, '/api'),
      },
    },
  },
  optimizeDeps: {
    exclude: ['kysely-wasqlite-worker'],
  },
  worker: {
    format: 'es',
  },
  build: {
    outDir: 'dist',
    target: 'esnext',
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-utils/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
})
