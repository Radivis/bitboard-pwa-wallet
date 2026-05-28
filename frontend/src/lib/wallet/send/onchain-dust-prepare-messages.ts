import { UX_DUST_FLOOR_SATS } from '@/lib/wallet/bitcoin-dust'

const RAISED_TO_MIN_OUTPUT_WARNING = `Amount was below the minimum output size (${UX_DUST_FLOOR_SATS} sats). It was increased automatically.`

/** User-facing toast when a payment was bumped to the minimum non-dust output size. */
export function minOutputSizeRaisedToastMessage(): string {
  return RAISED_TO_MIN_OUTPUT_WARNING
}

export function onchainDustPrepareWarningLines(outcome: {
  isRaisedToMinDust: boolean
  bumpedChangeFree: boolean
}): string[] {
  const lines: string[] = []
  if (outcome.isRaisedToMinDust) {
    lines.push(RAISED_TO_MIN_OUTPUT_WARNING)
  }
  if (outcome.bumpedChangeFree) {
    lines.push(
      'Change for this transaction would have been below the dust limit; the amount was increased to make the transfer change-free.',
    )
  }
  return lines
}
