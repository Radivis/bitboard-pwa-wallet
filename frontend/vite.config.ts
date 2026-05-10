import fs from 'node:fs'
import path from 'path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import { readBitboardWalletVersion } from './common/bitboard-wallet-version'
import { esploraViteProxyEntries } from './src/lib/esplora-service-whitelist'
import { faucetViteProxyEntries } from './src/lib/faucet-definitions'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import wasm from 'vite-plugin-wasm'
const projectRoot = path.dirname(fileURLToPath(import.meta.url))

/** Safe segment for Workbox `cacheId` (alphanumeric + hyphens). */
function sanitizeWorkboxCacheIdSegment(version: string): string {
  const collapsed = version.replace(/[^a-zA-Z0-9-]+/g, '-').replace(/-+/g, '-')
  const trimmed = collapsed.replace(/^-|-$/g, '')
  return trimmed.length > 0 ? trimmed : 'unknown'
}

const workboxCacheId = `bitboard-wallet-${sanitizeWorkboxCacheIdSegment(readBitboardWalletVersion())}`

/** Escape a string for use literally inside a RegExp source (paths, filename slugs, etc.). */
function escapeRegExpLiteral(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const esploraDevProxy = Object.fromEntries(
  esploraViteProxyEntries().map((e) => [
    e.localPrefix,
    {
      target: e.targetOrigin,
      changeOrigin: true,
      secure: true,
      rewrite: (reqPath: string) =>
        reqPath.replace(
          new RegExp(`^${escapeRegExpLiteral(e.localPrefix)}`),
          e.upstreamPathPrefix,
        ),
    },
  ]),
)

const faucetDevProxy = Object.fromEntries(
  faucetViteProxyEntries().map((e) => [
    e.localPrefix,
    {
      target: e.targetOrigin,
      changeOrigin: true,
      secure: true,
      rewrite: (reqPath: string) =>
        reqPath.replace(
          new RegExp(`^${escapeRegExpLiteral(e.localPrefix)}`),
          e.upstreamPathPrefix,
        ),
    },
  ]),
)

/**
 * TanStack Router matches `routeFileIgnorePattern` against each filename under `routes/`.
 * TSX modules in `src/routes/library/articles/` are article content, not routes — discover them from disk so new files do not require manual regex updates.
 */
function libraryArticleRouteIgnorePattern(): string {
  const articlesDir = path.join(projectRoot, 'src/routes/library/articles')
  let tsxFiles: string[]
  try {
    tsxFiles = fs.readdirSync(articlesDir).filter((f) => f.endsWith('.tsx'))
  } catch {
    return '__tests__'
  }
  if (tsxFiles.length === 0) {
    return '__tests__'
  }
  const escapedBasenames = tsxFiles.map((f) => escapeRegExpLiteral(f.replace(/\.tsx$/i, '')))
  return `__tests__|^(?:${escapedBasenames.join('|')})\\.tsx$`
}

/** Fail `vite build` if fast Argon2 (CI) is enabled for a production bundle. */
function rejectArgon2CiInProductionBuild(): Plugin {
  return {
    name: 'reject-argon2-ci-in-production-build',
    configResolved(config) {
      if (config.mode !== 'production') return
      if (process.env.VITE_ARGON2_CI === '1') {
        throw new Error(
          'Security: VITE_ARGON2_CI=1 is not allowed in production builds. Use fast Argon2 only in dev/CI (non-production Vite mode).',
        )
      }
    },
  }
}

export default defineConfig({
  define: {
    // Expose CI to app so we can disable dev overlays (e.g. TanStack Router Devtools)
    // that intercept pointer events and break E2E tests.
    'import.meta.env.CI': JSON.stringify(!!process.env.CI),
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(readBitboardWalletVersion()),
  },
  plugins: [
    rejectArgon2CiInProductionBuild(),
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
        // Version-scoped so a new release gets a fresh precache namespace (see repository root VERSION).
        cacheId: workboxCacheId,
        cleanupOutdatedCaches: true,
        // Default 2 MiB is too small for main WASM (e.g. bitboard_crypto ~2.2 MiB after Vite 8 output).
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,wasm}'],
        runtimeCaching: [],
      },
    }),
  ],
  resolve: {
    alias: [
      { find: '@', replacement: path.resolve(projectRoot, './src') },
      { find: '@common', replacement: path.resolve(projectRoot, './common') },
      {
        find: '@legal-locale',
        replacement: path.resolve(projectRoot, './src/lib/legal-locale.ts'),
      },
      // Cross-project-safe aliases — the same module identifiers also resolve
      // from the landing-page Vite/TS configs, so files under `frontend/common/`
      // can import them without depending on `@/...` (which differs per project root).
      {
        find: '@legal-entity-fields',
        replacement: path.resolve(
          projectRoot,
          './src/components/LegalEntityFields.tsx',
        ),
      },
      {
        find: '@legal-entity',
        replacement: path.resolve(
          projectRoot,
          './src/legal-entity/legal-entity.ts',
        ),
      },
    ],
  },
  server: {
    port: 3000,
    proxy: {
      ...esploraDevProxy,
      ...faucetDevProxy,
    },
  },
  optimizeDeps: {
    exclude: ['kysely-wasqlite-worker'],
  },
  worker: {
    format: 'es',
    // Vite 8 (Rolldown) bundles workers separately; wasm imports need the plugin here too.
    plugins: () => [wasm()],
  },
  build: {
    // Default Rollup output uses content-hashed filenames under `assets/`; those pair with long Cache-Control on Vercel.
    outDir: 'dist',
    target: 'esnext',
    // Rolldown default is 500 kB (see chunkSizeWarningLimit). Per-package vendor groups fix the former ~1.5 MiB
    // entry chunk. The `zxcvbn` library remains one ~800 kB async chunk when lazy-loaded (cannot be split further).
    chunkSizeWarningLimit: 1024,
    // Put each top-level package in its own async chunk so no single vendor blob embeds unrelated dependencies.
    rolldownOptions: {
      output: {
        // Force module evaluation order to follow the static dependency graph.
        // Without this, Rolldown's chunk optimizer can reorder modules across
        // shared/vendor chunks and run side-effect-heavy modules before their
        // dependencies finish initializing — the same class of bug as
        // rolldown/rolldown#8812 (TinyMCE) and #9225 (@noble/curves+@noble/hashes).
        // For us this manifested as KaTeX rendering `\frac`, `\in`, `\mod`,
        // `\equiv`, `\cdot`, … as red "undefined control sequence" fragments
        // because the ~340 `defineMacro(...)` and ~650 `defineSymbol(...)`
        // top-level calls inside `katex.mjs` were not consistently executed
        // against the parser's macro table.
        strictExecutionOrder: true,
        codeSplitting: {
          minSize: 20_000,
          groups: [
            {
              priority: 1,
              test: /node_modules[\\/]/,
              name(moduleId: string) {
                const normalized = moduleId.replace(/\\/g, '/')
                const marker = '/node_modules/'
                const idx = normalized.indexOf(marker)
                if (idx === -1) return null
                const rest = normalized.slice(idx + marker.length)
                const segments = rest.split('/').filter(Boolean)
                if (segments.length === 0) return 'vendor'
                const packageRoot = segments[0].startsWith('@')
                  ? `${segments[0]}/${segments[1] ?? ''}`
                  : segments[0]
                return `vendor-${packageRoot.replace(/[@/]/g, '-')}`
              },
            },
          ],
        },
      },
    },
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
