import {
  arkadeAddressQueryKey,
  arkadeBalanceQueryKey,
  arkadeHistoryQueryKey,
} from '@/lib/arkade/arkade-query-keys'
import { isArkadeSupportedNetworkMode } from '@/lib/arkade/arkade-endpoints'
import { appQueryClient } from '@/lib/shared/app-query-client'
import { getArkadeWorker } from '@/workers/arkade-factory'
import type { ArkadeBalanceInfo, ArkadePaymentRow } from '@/workers/arkade-api'
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

/** Caller must ensure the Arkade WASM session is already open. */
export async function refreshArkadeStoreFromLoadedWasm(
  arkadeAccountIdForQueryCache?: string,
): Promise<void> {
  const worker = getArkadeWorker()
  const [balance, payments, receiveAddress] = await Promise.all([
    worker.getBalance(),
    worker.getTransactionHistory(),
    worker.getAddress(),
  ])
  useWalletStore.getState().setArkadeDashboardState({
    balance,
    payments,
    receiveAddress,
  })

  const walletState = useWalletStore.getState()
  const networkMode = getCommittedNetworkMode()
  const arkadeAccountId = arkadeAccountIdForQueryCache ?? walletState.activeArkadeAccountId
  if (arkadeAccountId != null && walletState.activeWalletId != null) {
    syncArkadeDashboardQueryCaches({
      walletId: walletState.activeWalletId,
      networkMode,
      arkadeAccountId,
      balance,
      payments,
      receiveAddress,
    })
  }
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
