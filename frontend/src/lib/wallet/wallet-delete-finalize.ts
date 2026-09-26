import { awaitInFlightWalletSecretsWrites } from '@/db/wallet-secrets-write-tracker'
import { removeLightningConnectionsHydrationQueries } from '@/lib/lightning/lightning-connections-hydration'
import { removeOnchainDashboardQueries } from '@/lib/wallet/onchain-dashboard-sync'
import { useLightningStore } from '@/stores/lightningStore'
import { useWalletStore } from '@/stores/walletStore'
import { useCryptoStore } from '@/stores/cryptoStore'
import { clearAutoLockTimer, clearLegacySessionState } from '@/stores/sessionStore'
import { resetSecretsChannel } from '@/workers/secrets-channel'

/**
 * After a wallet row and secrets are removed from SQLite: drop Lightning UI state for
 * that id. If it was the active wallet, lock or switch like a wallet change and tear down
 * the crypto worker so no deleted material stays in memory.
 * The delete mutation already discarded the Arkade session while the secrets row still
 * existed. Do not discard or flush again here.
 */
export async function finalizeWalletDeletion(params: {
  deletedWalletId: number
  wasActiveWallet: boolean
  nextActiveWalletId: number | null
}): Promise<void> {
  const { deletedWalletId, wasActiveWallet, nextActiveWalletId } = params

  useLightningStore.getState().removeLightningStateForWallet(deletedWalletId)

  if (!wasActiveWallet) {
    return
  }

  await awaitInFlightWalletSecretsWrites()
  clearAutoLockTimer()
  removeLightningConnectionsHydrationQueries()
  removeOnchainDashboardQueries()
  useLightningStore.getState().purgeLightningConnectionsFromMemory()

  if (nextActiveWalletId === null) {
    useWalletStore.getState().resetWallet()
  } else {
    useWalletStore.getState().lockWallet()
    useWalletStore.getState().setActiveWallet(nextActiveWalletId)
  }

  useCryptoStore.getState().terminateWorker()
  resetSecretsChannel()
  clearLegacySessionState()
}
