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

function writeArkadeDashboardState(params: {
  arkadeAccountIdForQueryCache?: string
  expectedWalletId?: number
  balance: ArkadeBalanceInfo
  payments: ArkadePaymentRow[]
  receiveAddress: string
}): void {
  const walletStateBeforeWrite = useWalletStore.getState()
  if (
    params.expectedWalletId != null &&
    walletStateBeforeWrite.activeWalletId !== params.expectedWalletId
  ) {
    return
  }
  walletStateBeforeWrite.setArkadeDashboardState({
    balance: params.balance,
    payments: params.payments,
    receiveAddress: params.receiveAddress,
  })

  const walletState = useWalletStore.getState()
  const networkMode = getCommittedNetworkMode()
  const arkadeAccountId =
    params.arkadeAccountIdForQueryCache ?? walletState.activeArkadeAccountId
  if (arkadeAccountId != null && walletState.activeWalletId != null) {
    syncArkadeDashboardQueryCaches({
      walletId: walletState.activeWalletId,
      networkMode,
      arkadeAccountId,
      balance: params.balance,
      payments: params.payments,
      receiveAddress: params.receiveAddress,
    })
  }
}

/**
 * Publish the open session's persisted envelope. Does not list boarding addresses.
 * When `expectedWalletId` is set, skip the write if the active wallet changed
 * while the read was in flight.
 */
export async function publishArkadeDashboardFromOpenSession(
  arkadeAccountIdForQueryCache?: string,
  expectedWalletId?: number,
): Promise<void> {
  const dashboard = await getArkadeWorker().getPersistedDashboard()
  writeArkadeDashboardState({
    arkadeAccountIdForQueryCache,
    expectedWalletId,
    balance: dashboard.balance,
    payments: dashboard.payments,
    receiveAddress: dashboard.receiveAddress,
  })
}

/**
 * Caller must ensure the Arkade WASM session is already open.
 * When `expectedWalletId` is set, skip the write if the active wallet changed
 * while the WASM read was in flight.
 *
 * Balance and history share one boarding listing. The receive address is a local peek.
 */
export async function refreshArkadeStoreFromLoadedWasm(
  arkadeAccountIdForQueryCache?: string,
  expectedWalletId?: number,
): Promise<void> {
  const worker = getArkadeWorker()
  const [dashboard, receiveAddress] = await Promise.all([
    worker.getLiveDashboard(),
    worker.getAddress(),
  ])
  writeArkadeDashboardState({
    arkadeAccountIdForQueryCache,
    expectedWalletId,
    balance: dashboard.balance,
    payments: dashboard.payments,
    receiveAddress,
  })
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
