import { arkadeAddressQueryKey } from '@/lib/arkade/arkade-query-keys'
import { isArkadeSupportedNetworkMode } from '@/lib/arkade/arkade-endpoints'
import { appQueryClient } from '@/lib/shared/app-query-client'
import { getArkadeWorker } from '@/workers/arkade-factory'
import type { ArkadeBalanceInfo, ArkadePaymentRow } from '@/workers/arkade-api'
import { useWalletStore, type NetworkMode } from '@/stores/walletStore'

function syncArkadeAddressQueryCache(params: {
  walletId: number
  networkMode: NetworkMode
  connectionId: string
  receiveAddress: string
}): void {
  if (!isArkadeSupportedNetworkMode(params.networkMode)) {
    return
  }
  appQueryClient.setQueryData(
    arkadeAddressQueryKey(params.walletId, params.networkMode, params.connectionId),
    params.receiveAddress,
  )
}

/** Caller must ensure the Arkade WASM session is already open. */
export async function refreshArkadeStoreFromLoadedWasm(
  connectionIdForQueryCache?: string,
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
  const connectionId = connectionIdForQueryCache ?? walletState.activeArkadeConnectionId
  if (
    connectionId != null &&
    walletState.activeWalletId != null &&
    receiveAddress.length > 0
  ) {
    syncArkadeAddressQueryCache({
      walletId: walletState.activeWalletId,
      networkMode: walletState.networkMode,
      connectionId,
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
