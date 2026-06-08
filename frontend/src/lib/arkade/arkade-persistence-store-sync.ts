import { getArkadeWorker } from '@/workers/arkade-factory'
import type { ArkadeBalanceInfo, ArkadePaymentRow } from '@/workers/arkade-api'
import { useWalletStore } from '@/stores/walletStore'

/** Caller must ensure the Arkade WASM session is already open. */
export async function refreshArkadeStoreFromLoadedWasm(): Promise<void> {
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
