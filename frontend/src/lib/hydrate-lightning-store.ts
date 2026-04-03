import { useLightningStore } from '@/stores/lightningStore'
import {
  loadLightningConnectionsForWallet,
  migrateLegacyLightningStorageIfNeeded,
} from '@/lib/lightning-wallet-secrets'

/**
 * Loads NWC connections from encrypted wallet secrets (and migrates legacy plain
 * settings once), then replaces the in-memory slice for this wallet.
 */
export async function hydrateLightningStoreAfterUnlock(params: {
  password: string
  walletId: number
}): Promise<void> {
  await migrateLegacyLightningStorageIfNeeded(params.password)
  const connections = await loadLightningConnectionsForWallet(params)
  useLightningStore.getState().replaceConnectionsForWallet(params.walletId, connections)
}
