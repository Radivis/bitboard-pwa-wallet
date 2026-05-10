// Imports the deployed `vendor-katex-*.js` chunk in a real browser context and
// asks the KaTeX object what it knows. Reveals whether macros are registered.

import { chromium } from 'playwright'
import fs from 'node:fs'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

const ARTICLES = ['/library/articles/ecdsa']
const BASE_URL = process.env.PROBE_URL ?? 'http://localhost:4179'

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
  serviceWorkers: 'block',
  extraHTTPHeaders: VERCEL_BYPASS_TOKEN
    ? { 'x-vercel-protection-bypass': VERCEL_BYPASS_TOKEN, 'x-vercel-set-bypass-cookie': 'true' }
    : undefined,
})
const page = await context.newPage()

page.on('console', (msg) => {
  if (msg.type() === 'error') console.log('[console.error]', msg.text())
})

const url = BASE_URL + ARTICLES[0]
console.log('--- Visiting', url)
await page.goto(url, { waitUntil: 'domcontentloaded' })
await page.waitForLoadState('networkidle').catch(() => {})

const result = await page.evaluate(async () => {
  const indexHtml = document.documentElement.outerHTML
  const scriptSrcs = Array.from(document.querySelectorAll('script[src]'))
    .map((s) => s.getAttribute('src') ?? '')
    .filter((s) => s)
  const katexScripts = scriptSrcs.filter((s) => s.includes('vendor-katex') || s.includes('katex'))

  let katexInfo = { found: false }
  try {
    const candidate = katexScripts[0] ?? scriptSrcs.find((s) => s.includes('vendor-katex'))
    if (candidate) {
      const mod = await import(candidate)
      const katex = mod.default ?? mod
      let renderResult = null
      try {
        renderResult = katex.renderToString('\\frac{1}{2}', { throwOnError: false })
      } catch (e) {
        renderResult = 'render-threw: ' + (e && e.message ? e.message : String(e))
      }
      katexInfo = {
        found: true,
        chunkUrl: candidate,
        keys: Object.keys(katex),
        version: katex.version,
        renderResult: renderResult?.slice(0, 400),
        macroCount:
          katex.__defineMacro && katex._macros
            ? Object.keys(katex._macros ?? {}).length
            : null,
      }
    }
  } catch (e) {
    katexInfo = { found: false, error: e?.message ?? String(e) }
  }

  return { scriptSrcs, katexScripts, katexInfo, indexHtmlSize: indexHtml.length }
})

console.log(JSON.stringify(result, null, 2))

await browser.close()
