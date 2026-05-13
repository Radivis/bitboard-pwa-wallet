/**
 * KaTeX production smoke test (Playwright, headless Chromium).
 *
 * Purpose
 * -------
 * Library articles use KaTeX via `react-katex`. When the bundle is wrong (e.g. Rolldown + CJS KaTeX),
 * standard LaTeX macros like `\frac`, `\in`, `\mod` fail while symbols like `\cdot` may still work.
 * `react-katex` often renders those failures as small red text (`throwOnError: false`), not always as
 * `.katex-error`, so this script also counts descendant nodes whose computed color looks like KaTeX red.
 *
 * What it checks
 * --------------
 * Opens two math-heavy routes (ECDSA + Schnorr), waits for network idle, then reports counts and samples.
 * Exit code `0` only when there are no `.katex-error` / `.err` matches **and** `redElementCount === 0`.
 *
 * How to run
 * ----------
 * Local production bundle (default URL matches `vite preview` without `--port`):
 *
 *   npm run build && npm run preview
 *   npm run probe:katex
 *
 * Custom origin (e.g. another port or a Vercel preview):
 *
 *   PROBE_URL=https://your-deployment.example.app npm run probe:katex
 *
 * Vercel Deployment Protection: pass a bypass token (do not commit tokens):
 *
 *   VERCEL_BYPASS_TOKEN=… npm run probe:katex
 *   # or: VERCEL_BYPASS_TOKEN_FILE=/path/to/token.txt npm run probe:katex
 *
 * Extra logging (first paint snapshot when `.katex` is still missing, etc.):
 *
 *   DEBUG_PROBE=1 npm run probe:katex
 *
 * Chromium: uses Playwright’s bundled browser from `~/.cache/ms-playwright` when present; otherwise
 * Playwright’s default resolution.
 *
 * @see ../README.md — **KaTeX in production (alias `katex` to its ESM entry)**
 */

import { chromium } from 'playwright'
import fs, { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

/** Library routes exercised — extend this list if you add articles with heavy KaTeX usage. */
const ARTICLES = ['/library/articles/ecdsa', '/library/articles/schnorr-signatures']

/** Base origin only; paths from `ARTICLES` are appended. Default = `vite preview` default port. */
const BASE_URL = process.env.PROBE_URL ?? 'http://localhost:4173'
const DEBUG_PROBE = process.env.DEBUG_PROBE === '1'
function readBypassTokenFromFile() {
  const tokenFile = process.env.VERCEL_BYPASS_TOKEN_FILE
  if (!tokenFile) return ''
  try {
    return fs.readFileSync(tokenFile, 'utf8').trim()
  } catch {
    return ''
  }
}
const VERCEL_BYPASS_TOKEN = process.env.VERCEL_BYPASS_TOKEN ?? readBypassTokenFromFile()

function resolveChromiumExecutable() {
  const cacheRoot = path.join(homedir(), '.cache/ms-playwright')
  if (!existsSync(cacheRoot)) return undefined
  const candidates = fs
    .readdirSync(cacheRoot)
    .filter((name) => name.startsWith('chromium-'))
    .map((name) => path.join(cacheRoot, name, 'chrome-linux/chrome'))
    .concat(
      fs
        .readdirSync(cacheRoot)
        .filter((name) => name.startsWith('chromium_headless_shell'))
        .map((name) => path.join(cacheRoot, name, 'chrome-linux/headless_shell')),
    )
    .filter((p) => existsSync(p))
  return candidates[0]
}

const executablePath = resolveChromiumExecutable()
const browser = await chromium.launch({ headless: true, executablePath })
const context = await browser.newContext({
  // Always hit the network for JS/CSS so we do not inherit a stale precached bundle from an old SW.
  serviceWorkers: 'block',
  extraHTTPHeaders: VERCEL_BYPASS_TOKEN
    ? { 'x-vercel-protection-bypass': VERCEL_BYPASS_TOKEN, 'x-vercel-set-bypass-cookie': 'true' }
    : undefined,
})
const page = await context.newPage()

page.on('console', (msg) => {
  if (msg.type() === 'error') console.log('[console.error]', msg.text())
})
page.on('pageerror', (err) => console.log('[pageerror]', err.message))

let totalErrors = 0
for (const route of ARTICLES) {
  const url = BASE_URL + route
  console.log('--- Visiting', url)
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle').catch(() => {})

  const initial = await page.evaluate(() => ({
    title: document.title,
    bodyTextSample: (document.body?.innerText ?? '').slice(0, 400),
    katexCount: document.querySelectorAll('.katex').length,
    katexErrCount: document.querySelectorAll('.katex .err, .katex-error').length,
  }))
  if (DEBUG_PROBE) console.log('initial:', initial)

  if (initial.katexCount === 0) {
    try {
      await page.waitForSelector('.katex', { timeout: 10_000 })
    } catch {
      console.log('No .katex elements appeared on', url)
    }
  }

  const summary = await page.evaluate(() => {
    const errs = Array.from(
      document.querySelectorAll(
        '.katex .err, .katex-error, .katex [title*="ParseError" i], .katex [title*="Undefined control" i]',
      ),
    )

    // Catch react-katex's inline error styling (often `rgb(204, 0, 0)`), not only `.katex-error`.
    function isRedish(rgb) {
      const m = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(rgb)
      if (!m) return false
      const [, r, g, b] = m.map(Number)
      return r > 150 && g < 80 && b < 80
    }
    const allKatexDescendants = Array.from(document.querySelectorAll('.katex *'))
    const redElements = allKatexDescendants.filter((node) => {
      const cs = window.getComputedStyle(node)
      return isRedish(cs.color)
    })

    const errSamples = errs.slice(0, 8).map((node) => ({
      text: node.textContent ?? '',
      title: node.getAttribute('title') ?? '',
      cls: node.className,
    }))
    const redSamples = redElements.slice(0, 8).map((node) => ({
      text: (node.textContent ?? '').slice(0, 60),
      cls: typeof node.className === 'string' ? node.className : '',
      tag: node.tagName.toLowerCase(),
    }))
    const tex = Array.from(document.querySelectorAll('.katex annotation'))
      .slice(0, 10)
      .map((n) => n.textContent ?? '')
    return {
      katexCount: document.querySelectorAll('.katex').length,
      errorCount: errs.length,
      redElementCount: redElements.length,
      errSamples,
      redSamples,
      texSamples: tex,
    }
  })
  totalErrors += summary.errorCount + summary.redElementCount
  console.log(JSON.stringify({ url, ...summary }, null, 2))
}

await browser.close()
process.exit(totalErrors === 0 ? 0 : 1)
