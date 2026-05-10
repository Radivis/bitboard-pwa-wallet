import { chromium } from 'playwright'
import fs from 'node:fs'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

const ARTICLES = ['/library/articles/ecdsa', '/library/articles/schnorr-signatures']
const BASE_URL = process.env.PROBE_URL ?? 'http://localhost:4178'

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
const context = await browser.newContext({ serviceWorkers: 'block' })
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
  console.log('initial:', initial)

  if (initial.katexCount === 0) {
    try {
      await page.waitForSelector('.katex', { timeout: 10_000 })
    } catch {
      console.log('No .katex elements appeared on', url)
    }
  }

  const summary = await page.evaluate(() => {
    const errs = Array.from(document.querySelectorAll('.katex .err, .katex-error'))
    const errSamples = errs.slice(0, 8).map((node) => ({
      text: node.textContent ?? '',
      title: node.getAttribute('title') ?? '',
    }))
    const tex = Array.from(document.querySelectorAll('.katex annotation'))
      .slice(0, 5)
      .map((n) => n.textContent ?? '')
    return {
      katexCount: document.querySelectorAll('.katex').length,
      errorCount: errs.length,
      errSamples,
      texSamples: tex,
    }
  })
  totalErrors += summary.errorCount
  console.log(JSON.stringify({ url, ...summary }, null, 2))
}

await browser.close()
process.exit(totalErrors === 0 ? 0 : 1)
