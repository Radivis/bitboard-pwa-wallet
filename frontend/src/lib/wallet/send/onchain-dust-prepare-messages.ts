import { UX_DUST_FLOOR_SATS } from '@/lib/wallet/bitcoin-dust'

export function onchainDustPrepareWarningLines(outcome: {
  raisedToMinDust: boolean
  bumpedChangeFree: boolean
}): string[] {
  const lines: string[] = []
  if (outcome.raisedToMinDust) {
    lines.push(
      `Amount was below the minimum output size (${UX_DUST_FLOOR_SATS} sats). It was increased automatically.`,
    )
  }
  if (outcome.bumpedChangeFree) {
    lines.push(
      'Change for this transaction would have been below the dust limit; the amount was increased to make the transfer change-free.',
    )
  }
  return lines
}
