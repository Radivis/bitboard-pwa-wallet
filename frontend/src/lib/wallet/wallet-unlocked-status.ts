import type { WalletStatus } from '@/stores/walletStore'

/**
 * True when this wallet session may use WASM and secrets.
 * Locked and absent wallets stay gated even if a rail snapshot is still
 * `syncing`: that request is leftover traffic, not an open session.
 */
export function walletIsUnlockedOrSyncing(walletStatus: WalletStatus): boolean {
  return walletStatus === 'unlocked'
}
