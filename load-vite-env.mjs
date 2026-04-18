/**
 * Loads repo-root env files and exposes values to Vite via `define`:
 * - `.env.legal-notice.de` / `.env.legal-notice.en` → `VITE_LEGAL_NOTICE_DE` / `VITE_LEGAL_NOTICE_EN`
 * - `.env.contacts` → `VITE_CONTACTS`
 * Resolved `dotenv` from `frontend/node_modules` or `landing-page/node_modules`.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function loadDotenvParse() {
  const candidates = [
    path.join(__dirname, 'frontend/package.json'),
    path.join(__dirname, 'landing-page/package.json'),
  ]
  for (const pkgJson of candidates) {
    try {
      const require = createRequire(pkgJson)
      return require('dotenv').parse
    } catch {
      // try next anchor
    }
  }
  throw new Error(
    'load-vite-env: could not resolve dotenv from frontend or landing-page; run npm install in those packages.',
  )
}

const parse = loadDotenvParse()

function readStringKeyFromEnvFile(filePath, key) {
  if (!fs.existsSync(filePath)) return ''
  const raw = fs.readFileSync(filePath, 'utf8')
  const parsed = parse(raw)
  const value = parsed[key]
  if (value === undefined || value === null) return ''
  return String(value).trim()
}

export function readViteLegalNoticeDeFromFile() {
  const envPath = path.join(__dirname, '.env.legal-notice.de')
  return readStringKeyFromEnvFile(envPath, 'VITE_LEGAL_NOTICE_DE')
}

export function readViteLegalNoticeEnFromFile() {
  const envPath = path.join(__dirname, '.env.legal-notice.en')
  return readStringKeyFromEnvFile(envPath, 'VITE_LEGAL_NOTICE_EN')
}

/** Values for Vite `define` so legal notice strings are available in app code. */
export function viteLegalNoticeDefine() {
  const de = readViteLegalNoticeDeFromFile()
  const en = readViteLegalNoticeEnFromFile()
  return {
    'import.meta.env.VITE_LEGAL_NOTICE_DE': JSON.stringify(de),
    'import.meta.env.VITE_LEGAL_NOTICE_EN': JSON.stringify(en),
  }
}

export function readViteContactsFromFile() {
  const contactsPath = path.join(__dirname, '.env.contacts')
  if (!fs.existsSync(contactsPath)) return ''
  const raw = fs.readFileSync(contactsPath, 'utf8')
  const parsed = parse(raw)
  const value = parsed.VITE_CONTACTS
  if (value === undefined || value === null) return ''
  return String(value).trim()
}

/** Values for Vite `define` so `import.meta.env.VITE_CONTACTS` is available in app code. */
export function viteContactsDefine() {
  const value = readViteContactsFromFile()
  return {
    'import.meta.env.VITE_CONTACTS': JSON.stringify(value),
  }
}
