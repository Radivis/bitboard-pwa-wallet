import { isValidSendAmountSats } from '@/lib/wallet/send/send-amount-validation'
import { UX_DUST_FLOOR_SATS } from '@/lib/wallet/bitcoin-dust'

export type LabMinDustFloorAdjustment = {
  previousSats: number
  raisedToDustMin: true
  bumpedChangeFree: false
}

export function resolveLabDraftAmountWithMinDustFloor(params: {
  amountSats: number
  confirmedBalance: number
}): {
  draftAmountSats: number
  dustAdjustment: LabMinDustFloorAdjustment | null
} {
  if (
    params.confirmedBalance >= UX_DUST_FLOOR_SATS &&
    isValidSendAmountSats(params.amountSats) &&
    params.amountSats > 0 &&
    params.amountSats < UX_DUST_FLOOR_SATS
  ) {
    return {
      draftAmountSats: UX_DUST_FLOOR_SATS,
      dustAdjustment: {
        previousSats: params.amountSats,
        raisedToDustMin: true,
        bumpedChangeFree: false,
      },
    }
  }

  return {
    draftAmountSats: params.amountSats,
    dustAdjustment: null,
  }
}
