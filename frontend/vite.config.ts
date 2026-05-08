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

const SOCIAL_SITE_ORIGIN_PLACEHOLDER = '__SOCIAL_SITE_ORIGIN__'
/** Full line in `index.html` (leading spaces + comment); replaced so og:url is not double-indented. */
const SOCIAL_META_OG_URL_LINE = '    <!--SOCIAL_META_OG_URL-->\n'

/**
 * Public origin used only in `index.html` for og:image / twitter:image (must be absolute URLs).
 * Set `VITE_SITE_ORIGIN` for the canonical HTTPS URL (especially when the public host is not
 * `*.vercel.app`). During `vercel build`, `VERCEL_URL` is usually available as a fallback.
 */
function resolvePublicSiteOriginForSocialMeta(): string {
  const raw = process.env.VITE_SITE_ORIGIN?.trim()
  if (raw) {
    if (raw.includes('"') || raw.includes("'") || raw.includes('<')) return ''
    const noTrailingSlash = raw.replace(/\/+$/, '')
    if (/^https:\/\//i.test(noTrailingSlash)) return noTrailingSlash
    const host = noTrailingSlash.replace(/^\/+/, '')
    if (!/^[a-z0-9].*$/i.test(host)) return ''
    return `https://${host}`
  }
  const vercel = process.env.VERCEL_URL?.trim()
  if (vercel && /^[a-z0-9.-]+$/i.test(vercel)) {
    return `https://${vercel}`
  }
  return ''
}

/** Rewrites social meta tags so image URLs are absolute (required by X and other crawlers). */
function injectSocialMetaSiteOrigin(): Plugin {
  let isProductionBuild = false
  return {
    name: 'inject-social-meta-site-origin',
    configResolved(config) {
      isProductionBuild = config.command === 'build' && config.mode === 'production'
    },
    transformIndexHtml(html, ctx) {
      const origin = ctx.server ? '' : resolvePublicSiteOriginForSocialMeta()
      if (isProductionBuild && !ctx.server && origin === '') {
        console.warn(
          '[inject-social-meta-site-origin] Production build: set VITE_SITE_ORIGIN (canonical https URL) ' +
            'or rely on VERCEL_URL; relative og:image is ignored by many social crawlers.',
        )
      }
      let out = html.replaceAll(SOCIAL_SITE_ORIGIN_PLACEHOLDER, origin)
      const ogUrlLine = origin
        ? `    <meta property="og:url" content="${origin}/" />\n`
        : ''
      out = out.replace(SOCIAL_META_OG_URL_LINE, ogUrlLine)
      return out
    },
  }
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
    injectSocialMetaSiteOrigin(),
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
    alias: {
      '@': path.resolve(projectRoot, './src'),
      '@common': path.resolve(projectRoot, './common'),
      '@legal-locale': path.resolve(projectRoot, './src/lib/legal-locale.ts'),
      // Cross-project-safe aliases — the same module identifiers also resolve
      // from the landing-page Vite/TS configs, so files under `frontend/common/`
      // can import them without depending on `@/...` (which differs per project root).
      '@legal-entity-fields': path.resolve(
        projectRoot,
        './src/components/LegalEntityFields.tsx',
      ),
      '@legal-entity': path.resolve(
        projectRoot,
        './src/legal-entity/legal-entity.ts',
      ),
    },
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
