import { awaitInFlightWalletSecretsWrites } from '@/db/wallet-secrets-write-tracker'
import { removeLightningConnectionsHydrationQueries } from '@/lib/lightning-connections-hydration'
import { useLightningStore } from '@/stores/lightningStore'
import { useWalletStore } from '@/stores/walletStore'
import { useCryptoStore } from '@/stores/cryptoStore'
import { useSessionStore, clearAutoLockTimer } from '@/stores/sessionStore'
import { resetSecretsChannel } from '@/workers/secrets-channel'

/**
 * After a wallet row and secrets are removed from SQLite: drop Lightning UI state for
 * that id. If it was the active wallet, lock/switch like a wallet change and tear down
 * the crypto worker and session so no deleted material stays in memory.
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
  useLightningStore.getState().purgeLightningConnectionsFromMemory()

  if (nextActiveWalletId === null) {
    useWalletStore.getState().resetWallet()
  } else {
    useWalletStore.getState().lockWallet()
    useWalletStore.getState().setActiveWallet(nextActiveWalletId)
  }

  useCryptoStore.getState().terminateWorker()
  resetSecretsChannel()
  useSessionStore.getState().clear()
}
