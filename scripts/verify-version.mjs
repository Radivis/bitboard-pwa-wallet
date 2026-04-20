#!/usr/bin/env node
/**
 * Ensures repository root `VERSION` matches Cargo workspace, npm packages, lockfile roots,
 * and workspace crates in `Cargo.lock`. Used in CI.
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  escapeRegExpLiteral,
  getCargoWorkspacePackageVersion,
  getRepositoryRoot,
  readTrimmedVersionFile,
} from './version-lib.mjs'

const repositoryRoot = getRepositoryRoot()

function getPackageJsonVersion(packageJsonPath) {
  return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')).version
}

function getNpmLockfileRootPackageVersions(lockfilePath, npmPackageName) {
  const lockfileContents = fs.readFileSync(lockfilePath, 'utf8')
  const nameVersionPairPattern = new RegExp(
    `"name": "${escapeRegExpLiteral(npmPackageName)}",\\s*\\n\\s*"version": "([^"]+)"`,
    'g',
  )
  const rootVersionStrings = []
  let match
  while ((match = nameVersionPairPattern.exec(lockfileContents)) !== null) {
    rootVersionStrings.push(match[1])
  }
  return rootVersionStrings
}

function getWorkspaceCrateVersionsFromCargoLock() {
  const cargoLockContents = fs.readFileSync(path.join(repositoryRoot, 'Cargo.lock'), 'utf8')
  const workspaceCrateNames = ['bitboard-crypto', 'bitboard-encryption', 'bitboard-lightning']
  const versionByCrateName = {}
  for (const crateName of workspaceCrateNames) {
    const crateEntryPattern = new RegExp(
      `name = "${escapeRegExpLiteral(crateName)}"\\nversion = "([^"]+)"`,
    )
    const crateVersionMatch = cargoLockContents.match(crateEntryPattern)
    if (!crateVersionMatch) {
      throw new Error(`Missing ${crateName} in Cargo.lock`)
    }
    versionByCrateName[crateName] = crateVersionMatch[1]
  }
  return versionByCrateName
}

const expectedVersion = readTrimmedVersionFile(repositoryRoot)
if (!expectedVersion) {
  console.error('VERSION is empty')
  process.exit(1)
}

const validationErrors = []

try {
  if (getCargoWorkspacePackageVersion(repositoryRoot) !== expectedVersion) {
    validationErrors.push(
      `Cargo.toml [workspace.package].version !== VERSION (${expectedVersion})`,
    )
  }
} catch (error) {
  validationErrors.push(String(error))
}

const frontendPackageJsonPath = path.join(repositoryRoot, 'frontend', 'package.json')
const landingPagePackageJsonPath = path.join(repositoryRoot, 'landing-page', 'package.json')
try {
  if (getPackageJsonVersion(frontendPackageJsonPath) !== expectedVersion) {
    validationErrors.push(`frontend/package.json version !== VERSION`)
  }
} catch (error) {
  validationErrors.push(String(error))
}
try {
  if (getPackageJsonVersion(landingPagePackageJsonPath) !== expectedVersion) {
    validationErrors.push(`landing-page/package.json version !== VERSION`)
  }
} catch (error) {
  validationErrors.push(String(error))
}

const frontendLockfileRootVersions = getNpmLockfileRootPackageVersions(
  path.join(repositoryRoot, 'frontend', 'package-lock.json'),
  'bitboard-pwa-wallet',
)
if (
  frontendLockfileRootVersions.length !== 2 ||
  !frontendLockfileRootVersions.every((declaredVersion) => declaredVersion === expectedVersion)
) {
  validationErrors.push(
    `frontend/package-lock.json: expected two root package versions "${expectedVersion}", got ${JSON.stringify(frontendLockfileRootVersions)}`,
  )
}

const landingPageLockfileRootVersions = getNpmLockfileRootPackageVersions(
  path.join(repositoryRoot, 'landing-page', 'package-lock.json'),
  'bitboard-wallet-landing-page',
)
if (
  landingPageLockfileRootVersions.length !== 2 ||
  !landingPageLockfileRootVersions.every((declaredVersion) => declaredVersion === expectedVersion)
) {
  validationErrors.push(
    `landing-page/package-lock.json: expected two root package versions "${expectedVersion}", got ${JSON.stringify(landingPageLockfileRootVersions)}`,
  )
}

try {
  const workspaceCrateVersions = getWorkspaceCrateVersionsFromCargoLock()
  for (const [crateName, cargoLockVersion] of Object.entries(workspaceCrateVersions)) {
    if (cargoLockVersion !== expectedVersion) {
      validationErrors.push(`Cargo.lock: ${crateName} version "${cargoLockVersion}" !== VERSION`)
    }
  }
} catch (error) {
  validationErrors.push(String(error))
}

if (validationErrors.length) {
  console.error('Version check failed:\n- ' + validationErrors.join('\n- '))
  process.exit(1)
}
console.log(`OK: all version files match VERSION (${expectedVersion})`)
