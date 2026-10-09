import type { ProgressBarkEmergencyExitDeps } from '@/lib/bark/perform-bark-emergency-exit'
import { getBarkWorker } from '@/workers/bark-factory'
import { getCryptoWorker } from '@/workers/crypto-factory'

export function barkEmergencyExitProgressDeps(): ProgressBarkEmergencyExitDeps {
  return {
    progress: () => getBarkWorker().progressEmergencyExits(),
    signChild: (request, feeRateSatPerVb) =>
      getCryptoWorker().signP2aCpfpChild({
        parentTxHex: request.parentTxHex,
        effectiveFeeRateSatPerVb: feeRateSatPerVb,
        rbfMinFeeRateSatPerKwu: request.rbfMinFeeRateSatPerKwu,
        currentPackageFeeSats: request.currentPackageFeeSats,
      }),
    provideChild: (parentTxid, childTxHex) =>
      getBarkWorker().provideEmergencyExitCpfp(parentTxid, childTxHex),
    rememberUnconfirmedChild: (childTxHex) =>
      getCryptoWorker().applyUnconfirmedFundingTx(
        childTxHex,
        Math.floor(Date.now() / 1000),
      ),
  }
}
