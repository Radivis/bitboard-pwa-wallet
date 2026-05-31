import { ensureMigrated } from '@/db/database'
import { appQueryClient } from '@/lib/shared/app-query-client'
import { toBitcoinNetwork } from '@/lib/wallet/bitcoin-utils'
import {
  loadLastSuccessfulEsploraSyncAtForDescriptorWallet,
  descriptorWalletKey,
} from '@/lib/wallet/onchain-esplora-sync-metadata'
import { WALLET_DB_QUERY_KEY_ROOT } from '@/lib/wallet/wallet-query-key-root'
import type { NetworkMode } from '@/stores/walletStore'
import {
  selectCommittedAccountId,
  selectCommittedAddressType,
  useWalletStore,
} from '@/stores/walletStore'
import { useSessionStore } from '@/stores/sessionStore'
import type { AddressType } from '@/lib/wallet/wallet-domain-types'

/** React Query key prefix for on-chain Esplora sync metadata (invalidate all with prefix). */
export const ONCHAIN_DASHBOARD_QUERY_KEY = [
  ...WALLET_DB_QUERY_KEY_ROOT,
  'onchain',
  'dashboard',
] as const

export function onchainEsploraSyncMetadataQueryKey(
  descriptorWalletKeyValue: string,
): readonly ['wallet_db', 'onchain', 'dashboard', 'esplora', string] {
  return [...ONCHAIN_DASHBOARD_QUERY_KEY, 'esplora', descriptorWalletKeyValue]
}

export interface OnchainEsploraSyncMetadataResult {
  isStaleOnchain: boolean
  lastSuccessfulEsploraSyncAt?: string
}

function activeDescriptorWalletContext():
  | {
      networkMode: NetworkMode
      addressType: AddressType
      accountId: number
      walletId: number
      password: string
    }
  | null {
  const password = useSessionStore.getState().password
  const walletState = useWalletStore.getState()
  const { activeWalletId, walletStatus, networkMode } = walletState
  if (
    password == null ||
    activeWalletId == null ||
    networkMode === 'lab' ||
    walletStatus === 'locked' ||
    walletStatus === 'none'
  ) {
    return null
  }
  return {
    networkMode,
    addressType: selectCommittedAddressType(walletState),
    accountId: selectCommittedAccountId(walletState),
    walletId: activeWalletId,
    password,
  }
}

export function getActiveDescriptorWalletKey(): string | null {
  const walletState = useWalletStore.getState()
  if (walletState.networkMode === 'lab' || walletState.activeWalletId == null) {
    return null
  }
  const network = toBitcoinNetwork(walletState.networkMode)
  return descriptorWalletKey({
    network,
    addressType: selectCommittedAddressType(walletState),
    accountId: selectCommittedAccountId(walletState),
  })
}

export async function resolveOnchainEsploraSyncMetadata(): Promise<
  OnchainEsploraSyncMetadataResult
> {
  const walletState = useWalletStore.getState()
  if (walletState.networkMode === 'lab') {
    return { isStaleOnchain: false }
  }
  if (walletState.walletStatus === 'syncing') {
    return { isStaleOnchain: false }
  }
  if (walletState.lastSyncTime != null) {
    return { isStaleOnchain: false }
  }

  const context = activeDescriptorWalletContext()
  if (context == null) {
    return { isStaleOnchain: false }
  }

  await ensureMigrated()
  const lastSuccessfulEsploraSyncAt =
    await loadLastSuccessfulEsploraSyncAtForDescriptorWallet({
      password: context.password,
      walletId: context.walletId,
      network: toBitcoinNetwork(context.networkMode),
      addressType: context.addressType,
      accountId: context.accountId,
    })
  if (lastSuccessfulEsploraSyncAt == null) {
    return { isStaleOnchain: false }
  }
  return {
    isStaleOnchain: true,
    lastSuccessfulEsploraSyncAt,
  }
}

export function invalidateOnchainDashboardQueries(): void {
  void appQueryClient.invalidateQueries({ queryKey: ONCHAIN_DASHBOARD_QUERY_KEY })
}

/** Call when purging wallet session state so stale metadata is not served from cache after lock. */
export function removeOnchainDashboardQueries(): void {
  appQueryClient.removeQueries({ queryKey: ONCHAIN_DASHBOARD_QUERY_KEY })
}
