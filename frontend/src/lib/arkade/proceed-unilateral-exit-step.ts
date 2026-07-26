import { awaitArkadeLoadQuiescence } from '@/lib/wallet/lifecycle/arkade-load-lifecycle-orchestrator'
import { getArkadeWorker } from '@/workers/arkade-factory'
import type { ArkadeVtxoOutpoint } from '@/workers/arkade-api'
import { sortArkadeVtxoOutpoints } from '@/workers/arkade-api'

export const ARKADE_WALLET_UNLOCKED_ERROR = 'Wallet must be unlocked'

export function assertArkadeSessionUnlocked(
  activeWalletId: number | null,
): asserts activeWalletId is number {
  if (activeWalletId == null) {
    throw new Error(ARKADE_WALLET_UNLOCKED_ERROR)
  }
}

export async function proceedUnilateralExitStepWithGuards(params: {
  activeWalletId: number | null
  vtxoOutpoints: ArkadeVtxoOutpoint[]
  feeRateSatPerVb: number
}) {
  assertArkadeSessionUnlocked(params.activeWalletId)
  await awaitArkadeLoadQuiescence()
  return getArkadeWorker().proceedUnilateralExitStep({
    vtxoOutpoints: sortArkadeVtxoOutpoints(params.vtxoOutpoints),
    feeRateSatPerVb: params.feeRateSatPerVb,
  })
}
