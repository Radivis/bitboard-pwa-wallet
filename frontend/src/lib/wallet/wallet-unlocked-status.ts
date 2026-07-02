import type { WalletStatus } from '@/stores/walletStore'
import { isAnyRailSyncing } from '@/lib/wallet/lifecycle/wallet-rail-sync-aggregate'

/** True when the WASM wallet session is active enough for descriptor/network switches. */
export function walletIsUnlockedOrSyncing(walletStatus: WalletStatus): boolean {
  return walletStatus === 'unlocked' || isAnyRailSyncing()
}
