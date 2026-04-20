/**
 * Shared helpers for `sync-version.mjs` and `verify-version.mjs` so Cargo/npm/lockfile
 * version logic stays in one place.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Repository root (`bitboard-pwa-wallet/`), one level above `scripts/`. */
export function getRepositoryRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
}

export function readTrimmedVersionFile(repositoryRoot) {
  return fs.readFileSync(path.join(repositoryRoot, 'VERSION'), 'utf8').trim()
}

/** Matches the `[workspace.package]` `version = "…"` line in the workspace `Cargo.toml`. */
export const WORKSPACE_PACKAGE_VERSION_PATTERN =
  /\[workspace\.package\][\s\S]*?^version\s*=\s*"([^"]+)"/m

export function getCargoWorkspacePackageVersion(repositoryRoot) {
  const cargoTomlContents = fs.readFileSync(path.join(repositoryRoot, 'Cargo.toml'), 'utf8')
  const workspacePackageVersionMatch = cargoTomlContents.match(WORKSPACE_PACKAGE_VERSION_PATTERN)
  if (!workspacePackageVersionMatch) {
    throw new Error('No [workspace.package] version in Cargo.toml')
  }
  return workspacePackageVersionMatch[1]
}

export function updateCargoWorkspacePackageVersion(repositoryRoot, newVersion) {
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

export function escapeRegExpLiteral(literal) {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
