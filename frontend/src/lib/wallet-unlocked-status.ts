import type { WalletStatus } from '@/stores/walletStore'

/** True when the WASM wallet session is active enough for descriptor/network switches. */
export function walletIsUnlockedOrSyncing(walletStatus: WalletStatus): boolean {
  return walletStatus === 'unlocked' || walletStatus === 'syncing'
}
