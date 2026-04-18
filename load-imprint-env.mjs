/**
 * Loads repo-root env files and exposes values to Vite via `define`:
 * - `.env.imprint` → `VITE_IMPRINT`
 * - `.env.contacts` → `VITE_CONTACTS`
 * Resolved `dotenv` from `frontend/node_modules` (both apps in this repo depend on tooling that pulls it in).
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
    'load-imprint-env: could not resolve dotenv from frontend or landing-page; run npm install in those packages.',
  )
}

const parse = loadDotenvParse()

export function readViteImprintFromFile() {
  const imprintPath = path.join(__dirname, '.env.imprint')
  if (!fs.existsSync(imprintPath)) return ''
  const raw = fs.readFileSync(imprintPath, 'utf8')
  const parsed = parse(raw)
  const value = parsed.VITE_IMPRINT
  if (value === undefined || value === null) return ''
  return String(value).trim()
}

/** Values for Vite `define` so `import.meta.env.VITE_IMPRINT` is available in app code. */
export function viteImprintDefine() {
  const value = readViteImprintFromFile()
  return {
    'import.meta.env.VITE_IMPRINT': JSON.stringify(value),
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
