import {
  arkadeAddressQueryKey,
  arkadeBalanceQueryKey,
  arkadeHistoryQueryKey,
} from '@/lib/arkade/arkade-query-keys'
import { isArkadeSupportedNetworkMode } from '@/lib/arkade/arkade-endpoints'
import { appQueryClient } from '@/lib/shared/app-query-client'
import { getArkadeWorker } from '@/workers/arkade-factory'
import type {
  ArkadeBalanceInfo,
  ArkadePaymentRow,
  ArkadePersistedDashboard,
} from '@/workers/arkade-api'
import {
  getCommittedNetworkMode,
  useWalletStore,
  type NetworkMode,
} from '@/stores/walletStore'

function syncArkadeDashboardQueryCaches(params: {
  walletId: number
  networkMode: NetworkMode
  arkadeAccountId: string
  balance: ArkadeBalanceInfo
  payments: ArkadePaymentRow[]
  receiveAddress: string
}): void {
  if (!isArkadeSupportedNetworkMode(params.networkMode)) {
    return
  }
  appQueryClient.setQueryData(
    arkadeBalanceQueryKey(params.walletId, params.networkMode, params.arkadeAccountId),
    params.balance,
  )
  appQueryClient.setQueryData(
    arkadeHistoryQueryKey(params.walletId, params.networkMode, params.arkadeAccountId),
    params.payments,
  )
  if (params.receiveAddress.length > 0) {
    appQueryClient.setQueryData(
      arkadeAddressQueryKey(params.walletId, params.networkMode, params.arkadeAccountId),
      params.receiveAddress,
    )
  }
}

function writeArkadeDashboardSnapshot(
  dashboard: ArkadePersistedDashboard,
  arkadeAccountIdForQueryCache?: string,
  expectedWalletId?: number,
): void {
  const walletStateBeforeWrite = useWalletStore.getState()
  if (
    expectedWalletId != null &&
    walletStateBeforeWrite.activeWalletId !== expectedWalletId
  ) {
    return
  }
  walletStateBeforeWrite.setArkadeDashboardState({
    balance: dashboard.balance,
    payments: dashboard.payments,
    receiveAddress: dashboard.receiveAddress,
  })

  const walletState = useWalletStore.getState()
  const networkMode = getCommittedNetworkMode()
  const arkadeAccountId = arkadeAccountIdForQueryCache ?? walletState.activeArkadeAccountId
  if (arkadeAccountId == null || walletState.activeWalletId == null) {
    return
  }
  syncArkadeDashboardQueryCaches({
    walletId: walletState.activeWalletId,
    networkMode,
    arkadeAccountId,
    balance: dashboard.balance,
    payments: dashboard.payments,
    receiveAddress: dashboard.receiveAddress,
  })
}

/**
 * Publish offchain snapshot, stored intents, and the local receive address.
 * Does not list boarding addresses on Esplora. Session start awaits this before `loaded`.
 */
export async function publishArkadeDashboardFromPersistedEnvelope(
  arkadeAccountIdForQueryCache?: string,
  expectedWalletId?: number,
): Promise<void> {
  const dashboard = await getArkadeWorker().getPersistedDashboard()
  writeArkadeDashboardSnapshot(
    dashboard,
    arkadeAccountIdForQueryCache,
    expectedWalletId,
  )
}

/**
 * Caller must ensure the Arkade WASM session is already open.
 * When `expectedWalletId` is set, skip the write if the active wallet changed
 * while the WASM read was in flight.
 *
 * Balance lists boarding addresses on Esplora. History repeats that list, so it
 * runs after balance and can reuse the address-UTXO cache. This belongs after
 * `loaded`, with post-load sync, outside the session-start deadline.
 */
export async function refreshArkadeStoreFromLoadedWasm(
  arkadeAccountIdForQueryCache?: string,
  expectedWalletId?: number,
): Promise<void> {
  const worker = getArkadeWorker()
  const [balance, receiveAddress] = await Promise.all([
    worker.getBalance(),
    worker.getAddress(),
  ])
  const payments = await worker.getTransactionHistory()
  writeArkadeDashboardSnapshot(
    { balance, payments, receiveAddress },
    arkadeAccountIdForQueryCache,
    expectedWalletId,
  )
}

export function clearArkadeDashboardStore(): void {
  useWalletStore.getState().clearArkadeDashboardState()
}

export function readArkadeDashboardStateFromStore(): {
  balance: ArkadeBalanceInfo | null
  payments: ArkadePaymentRow[]
  receiveAddress: string | null
} {
  const state = useWalletStore.getState()
  return {
    balance: state.arkadeBalance,
    payments: state.arkadePayments,
    receiveAddress: state.arkadeReceiveAddress,
  }
}
