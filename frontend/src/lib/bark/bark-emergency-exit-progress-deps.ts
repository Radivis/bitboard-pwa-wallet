import type { BarkEmergencyExitScope } from '@/lib/bark/bark-emergency-exit-funding-status'
import {
  isBarkCpfpUnfundableError,
  progressBarkEmergencyExits,
  type BarkEmergencyExitProgressOutcome,
  type ProgressBarkEmergencyExitDeps,
} from '@/lib/bark/perform-bark-emergency-exit'
import { useBarkEmergencyExitFundingStore } from '@/stores/barkEmergencyExitFundingStore'
import { getBarkWorker } from '@/workers/bark-factory'
import { getCryptoWorker } from '@/workers/crypto-factory'

export function barkEmergencyExitProgressDeps(): ProgressBarkEmergencyExitDeps {
  return {
    progress: () => getBarkWorker().progressEmergencyExits(),
    signChild: (request, feeRateSatPerVb) =>
      getCryptoWorker().signP2aCpfpChild({
        parentTxHex: request.parentTxHex,
        effectiveFeeRateSatPerVb: feeRateSatPerVb,
      }),
    provideChild: (parentTxid, childTxHex) =>
      getBarkWorker().provideEmergencyExitCpfp(parentTxid, childTxHex),
    rememberUnconfirmedChild: (childTxHex) =>
      getCryptoWorker().applyUnconfirmedFundingTx(
        childTxHex,
        Math.floor(Date.now() / 1000),
      ),
    onchainTotalSats: async () => (await getCryptoWorker().getBalance()).totalSats,
  }
}

/**
 * The one entry point for every progress trigger. Records whether exits are still
 * waiting for confirmed funds for `scope`; a null scope records nothing.
 */
export async function runBarkEmergencyExitProgress(
  scope: BarkEmergencyExitScope | null,
  feeRateSatPerVb: number,
): Promise<BarkEmergencyExitProgressOutcome> {
  const fundingStore = useBarkEmergencyExitFundingStore.getState()
  let outcome: BarkEmergencyExitProgressOutcome
  try {
    outcome = await progressBarkEmergencyExits(barkEmergencyExitProgressDeps(), feeRateSatPerVb)
  } catch (err) {
    if (isBarkCpfpUnfundableError(err)) {
      fundingStore.clearFundingStatus()
      if (scope != null) fundingStore.recordUnfundedParents(scope, err.unfundedParentTxids)
    }
    throw err
  }
  if (scope != null) fundingStore.recordProgressOutcome(scope, outcome)
  return outcome
}
