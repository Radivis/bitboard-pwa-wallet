import type { BalanceInfo } from '@/workers/crypto-types'
import type { NetworkMode } from '@/stores/walletStore'

export function computeSendPageBalances(params: {
  networkMode: NetworkMode
  labBalanceSats: number | null
  balance: BalanceInfo | null
}): { confirmedBalance: number; totalBalanceSats: number } {
  if (params.networkMode === 'lab' && params.labBalanceSats !== null) {
    return {
      confirmedBalance: params.labBalanceSats,
      totalBalanceSats: params.labBalanceSats,
    }
  }

  return {
    confirmedBalance: params.balance?.confirmedSats ?? 0,
    totalBalanceSats: params.balance?.totalSats ?? 0,
  }
}
