import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Repository root (`bitboard-pwa-wallet/`), two levels above `frontend/common/`. */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

/**
 * Bitboard Wallet release version. Single source of truth: repository root `VERSION` file
 * (synced into Cargo workspace and npm `package.json` files by `scripts/sync-version.mjs`).
 */
export function readBitboardWalletVersion(): string {
  const raw = fs.readFileSync(path.join(repoRoot, 'VERSION'), 'utf8')
  const v = raw.trim()
  if (!v) {
    throw new Error('VERSION file is empty')
  }
  return v
}
