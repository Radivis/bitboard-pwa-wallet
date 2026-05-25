import { awaitInFlightWalletSecretsWrites } from '@/db/wallet-secrets-write-tracker'
import { removeLightningConnectionsHydrationQueries } from '@/lib/lightning-connections-hydration'
import { useLightningStore } from '@/stores/lightningStore'
import { useWalletStore } from '@/stores/walletStore'

/**
 * Lock the current session, purge in-memory Lightning state, and set the active wallet id.
 * Call before navigating to wallet UI after the user picks a different wallet.
 */
export async function prepareActiveWalletSwitch(walletId: number): Promise<void> {
  await awaitInFlightWalletSecretsWrites()
  useLightningStore.getState().purgeLightningConnectionsFromMemory()
  removeLightningConnectionsHydrationQueries()
  useWalletStore.getState().lockWallet()
  useWalletStore.getState().setActiveWallet(walletId)
}
