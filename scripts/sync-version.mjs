#!/usr/bin/env node
/**
 * Reads the repository root `VERSION` file and writes it to:
 * - `Cargo.toml` `[workspace.package].version`
 * - `frontend/package.json` and `landing-page/package.json`
 * - root entries in `frontend/package-lock.json` and `landing-page/package-lock.json`
 *
 * Run after editing `VERSION`, then run `cargo build --workspace` (or `cargo generate-lockfile`)
 * so `Cargo.lock` matches.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const WORKSPACE_PACKAGE_VERSION_PATTERN =
  /\[workspace\.package\][\s\S]*?^version\s*=\s*"([^"]+)"/m

function readVersionFileContents() {
  const trimmedVersion = fs.readFileSync(path.join(repositoryRoot, 'VERSION'), 'utf8').trim()
  if (!trimmedVersion) throw new Error('VERSION is empty')
  return trimmedVersion
}

function updateCargoWorkspacePackageVersion(newVersion) {
  const cargoTomlPath = path.join(repositoryRoot, 'Cargo.toml')
  const cargoTomlContents = fs.readFileSync(cargoTomlPath, 'utf8')
  if (!cargoTomlContents.includes('[workspace.package]')) {
    throw new Error('Cargo.toml must contain [workspace.package] with version')
  }
  const currentVersionMatch = cargoTomlContents.match(WORKSPACE_PACKAGE_VERSION_PATTERN)
  if (!currentVersionMatch) {
    throw new Error('Could not find [workspace.package] version in Cargo.toml')
  }
  if (currentVersionMatch[1] === newVersion) {
    return
  }
  const updatedCargoTomlContents = cargoTomlContents.replace(
    /(\[workspace\.package\][\s\S]*?^version\s*=\s*")([^"]+)(")/m,
    `$1${newVersion}$3`,
  )
  if (updatedCargoTomlContents === cargoTomlContents) {
    throw new Error('Could not patch workspace.package version in Cargo.toml')
  }
  fs.writeFileSync(cargoTomlPath, updatedCargoTomlContents)
}

function updatePackageJsonVersionField(packageJsonPath, newVersion) {
  const packageJsonContents = fs.readFileSync(packageJsonPath, 'utf8')
  const currentVersion = JSON.parse(packageJsonContents).version
  if (currentVersion === newVersion) {
    return
  }
  const updatedPackageJsonContents = packageJsonContents.replace(
    /^(\s*"version"\s*:\s*")([^"]+)(")/m,
    `$1${newVersion}$3`,
  )
  if (updatedPackageJsonContents === packageJsonContents) {
    throw new Error(`Could not patch version in ${packageJsonPath}`)
  }
  fs.writeFileSync(packageJsonPath, updatedPackageJsonContents)
}

function escapeRegExp(literal) {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function updateNpmLockfileRootPackageVersions(npmPackageName, lockfilePath, newVersion) {
  const lockfileContents = fs.readFileSync(lockfilePath, 'utf8')
  const rootPackageVersionPattern = new RegExp(
    `("name": "${escapeRegExp(npmPackageName)}",\\s*\\n\\s*"version": ")([^"]+)(")`,
    'g',
  )
  const rootVersionStrings = []
  let rootEntryMatch
  while ((rootEntryMatch = rootPackageVersionPattern.exec(lockfileContents)) !== null) {
    rootVersionStrings.push(rootEntryMatch[2])
  }
  if (
    rootVersionStrings.length === 2 &&
    rootVersionStrings.every((declaredVersion) => declaredVersion === newVersion)
  ) {
    return
  }
  const updatedLockfileContents = lockfileContents.replace(
    rootPackageVersionPattern,
    `$1${newVersion}$3`,
  )
  if (updatedLockfileContents === lockfileContents) {
    throw new Error(`Could not patch ${npmPackageName} in ${lockfilePath}`)
  }
  fs.writeFileSync(lockfilePath, updatedLockfileContents)
}

const syncedVersion = readVersionFileContents()
console.log(`Syncing version "${syncedVersion}" from VERSION`)
updateCargoWorkspacePackageVersion(syncedVersion)
updatePackageJsonVersionField(path.join(repositoryRoot, 'frontend', 'package.json'), syncedVersion)
updatePackageJsonVersionField(
  path.join(repositoryRoot, 'landing-page', 'package.json'),
  syncedVersion,
)
updateNpmLockfileRootPackageVersions(
  'bitboard-pwa-wallet',
  path.join(repositoryRoot, 'frontend', 'package-lock.json'),
  syncedVersion,
)
updateNpmLockfileRootPackageVersions(
  'bitboard-wallet-landing-page',
  path.join(repositoryRoot, 'landing-page', 'package-lock.json'),
  syncedVersion,
)
console.log('Done. Run: cargo build --workspace  (or cargo generate-lockfile) to refresh Cargo.lock')
