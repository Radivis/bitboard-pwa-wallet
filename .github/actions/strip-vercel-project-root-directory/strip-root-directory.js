'use strict'
/**
 * Removes settings.rootDirectory from a pulled Vercel project.json so --cwd from repo root
 * does not double-apply Root Directory (see docs/deploy-vercel.md).
 */
const fs = require('fs')

const projectJsonPath = process.argv[2]
if (!projectJsonPath) {
  console.error('strip-root-directory: missing path to .vercel/project.json')
  process.exit(1)
}

if (!fs.existsSync(projectJsonPath)) {
  process.exit(0)
}

const raw = fs.readFileSync(projectJsonPath, 'utf8')
const j = JSON.parse(raw)
if (
  j.settings &&
  Object.prototype.hasOwnProperty.call(j.settings, 'rootDirectory')
) {
  delete j.settings.rootDirectory
  fs.writeFileSync(projectJsonPath, JSON.stringify(j, null, '\t'))
  console.log('Removed settings.rootDirectory from', projectJsonPath)
}
