import {
  BITCOIN_DISPLAY_UNIT_LABEL,
  formatAmountInBitcoinDisplayUnit,
} from '@/lib/bitcoin-display-unit'
import { UX_DUST_FLOOR_SATS } from '@/lib/bitcoin-dust'
import type { OnchainDustWarning, SendAmountUnit } from '@/stores/sendStore'

/** Shown on the review step below the amount summary so it stays visible when confirming. */
export function OnchainDustWarningReviewBanner({
  warning,
  amountUnit,
}: {
  warning: OnchainDustWarning | null
  amountUnit: SendAmountUnit
}) {
  if (warning == null) return null
  return (
    <div className="font-bold text-destructive text-sm space-y-1 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2">
      {warning.raisedToDustMin ? (
        <p>
          Amount was below the minimum spendable output ({formatAmountInBitcoinDisplayUnit(UX_DUST_FLOOR_SATS, 'sat')}{' '}
          {BITCOIN_DISPLAY_UNIT_LABEL.sat}). The amount shown above was set to{' '}
          {formatAmountInBitcoinDisplayUnit(UX_DUST_FLOOR_SATS, amountUnit)}{' '}
          {BITCOIN_DISPLAY_UNIT_LABEL[amountUnit]}.
        </p>
      ) : null}
      {warning.bumpedChangeFree ? (
        <p>
          The amount was increased so this payment does not leave change below the dust limit
          (change-free transfer).
        </p>
      ) : null}
    </div>
  )
}
