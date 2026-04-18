import fs from 'node:fs'
import path from 'path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import wasm from 'vite-plugin-wasm'
import { viteContactsDefine, viteLegalNoticeDefine } from '../load-vite-env.mjs'

const projectRoot = path.dirname(fileURLToPath(import.meta.url))

/** Escape a string for use inside a RegExp (filename slug segments). */
function escapeRegExpSegment(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * TanStack Router matches `routeFileIgnorePattern` against each filename under `routes/`.
 * TSX modules in `src/routes/library/articles/` are article content, not routes — discover them from disk so new files do not require manual regex updates.
 */
function readAppVersion(): string {
  try {
    const pkgPath = path.join(projectRoot, 'package.json')
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { version?: string }
    return typeof pkg.version === 'string' ? pkg.version : '0.0.0'
  } catch {
    return '0.0.0'
  }
}

function libraryArticleRouteIgnorePattern(): string {
  const articlesDir = path.join(projectRoot, 'src/routes/library/articles')
  let tsxFiles: string[] = []
  try {
    tsxFiles = fs.readdirSync(articlesDir).filter((f) => f.endsWith('.tsx'))
  } catch {
    return '__tests__'
  }
  if (tsxFiles.length === 0) {
    return '__tests__'
  }
  const escapedBasenames = tsxFiles.map((f) => escapeRegExpSegment(f.replace(/\.tsx$/i, '')))
  return `__tests__|^(?:${escapedBasenames.join('|')})\\.tsx$`
}

export default defineConfig({
  define: {
    // Expose CI to app so we can disable dev overlays (e.g. TanStack Router Devtools)
    // that intercept pointer events and break E2E tests.
    'import.meta.env.CI': JSON.stringify(!!process.env.CI),
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(readAppVersion()),
    ...viteLegalNoticeDefine(),
    ...viteContactsDefine(),
  },
  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
      routeFileIgnorePattern: libraryArticleRouteIgnorePattern(),
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
      '@': path.resolve(projectRoot, './src'),
      '@common': path.resolve(projectRoot, './common'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/esplora-proxy/signet': {
        target: 'https://mutinynet.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) =>
          path.replace(/^\/esplora-proxy\/signet/, '/api'),
      },
      '/esplora-proxy/testnet': {
        target: 'https://mempool.space',
        changeOrigin: true,
        secure: true,
        rewrite: (path) =>
          path.replace(/^\/esplora-proxy\/testnet/, '/testnet4/api'),
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
    coverage: {
      provider: 'v8',
      // Only 'lcov' for HTML (writes coverage/lcov-report/). Avoid 'html' to prevent duplicate coverage/ and coverage/lcov-report/.
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        '**/*.d.ts',
        '**/__tests__/**',
        '**/test-utils/**',
        '**/routeTree.gen.ts',
      ],
    },
  },
})
