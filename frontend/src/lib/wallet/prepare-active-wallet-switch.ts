import { closeArkadeSession } from '@/lib/arkade/arkade-session-service'
import { tearDownArkadeWorkerAndClientState } from '@/lib/arkade/arkade-session-teardown'
import { awaitInFlightWalletSecretsWrites } from '@/db/wallet-secrets-write-tracker'
import { removeLightningConnectionsHydrationQueries } from '@/lib/lightning/lightning-connections-hydration'
import { syncAllRailLifecyclesWithLockPhase } from '@/lib/wallet/lifecycle/rail-lifecycle-lock-handoff'
import { releasePreviousWalletDashboardSession } from '@/lib/wallet/new-wallet-dashboard-session'
import { removeOnchainDashboardQueries } from '@/lib/wallet/onchain-dashboard-sync'
import { useLightningStore } from '@/stores/lightningStore'
import { useWalletStore } from '@/stores/walletStore'

/**
 * Drop the Arkade worker even when flush or quiescence fails, so the next wallet
 * cannot observe the previous session.
 */
async function closeArkadeSessionForWalletSwitch(): Promise<void> {
  try {
    await closeArkadeSession()
  } catch {
    tearDownArkadeWorkerAndClientState()
  }
}

/**
 * Tear down the previous wallet's Arkade session, clear dashboard snapshots, lock,
 * and set the active wallet id.
 *
 * Call before navigating to wallet UI after the user picks a different wallet.
 * This does not end the app-password session or send the user to the library.
 * Those steps belong to a user-facing lock (`lockAndPurgeSensitiveRuntimeState`).
 */
export async function prepareActiveWalletSwitch(walletId: number): Promise<void> {
  await awaitInFlightWalletSecretsWrites()
  await closeArkadeSessionForWalletSwitch()
  releasePreviousWalletDashboardSession(walletId)
  useLightningStore.getState().purgeLightningConnectionsFromMemory()
  removeLightningConnectionsHydrationQueries()
  syncAllRailLifecyclesWithLockPhase('locked')
  removeOnchainDashboardQueries()
  useWalletStore.getState().lockWallet()
  useWalletStore.getState().setActiveWallet(walletId)
}
