import { DesignBanner } from '@/components/design/DesignBanner'
import {
  formatAmountInBitcoinDisplayUnit,
  getPrefixedBitcoinDisplayUnitLabel,
} from '@/lib/wallet/bitcoin-display-unit'
import { UX_DUST_FLOOR_SATS } from '@/lib/wallet/bitcoin-dust'
import type { OnchainDustWarning, SendAmountUnit } from '@/stores/sendStore'
import { selectCommittedNetworkMode, useWalletStore } from '@/stores/walletStore'

/** Shown on the review step below the amount summary so it stays visible when confirming. */
export function OnchainDustWarningReviewBanner({
  warning,
  amountUnit,
}: {
  warning: OnchainDustWarning | null
  amountUnit: SendAmountUnit
}) {
  const networkMode = useWalletStore(selectCommittedNetworkMode)
  if (warning == null) return null
  const satLabel = getPrefixedBitcoinDisplayUnitLabel('sat', networkMode)
  const amountUnitLabel = getPrefixedBitcoinDisplayUnitLabel(amountUnit, networkMode)
  const raisedCopy = warning.isRaisedToMinDust
    ? `Amount was below the minimum spendable output (${formatAmountInBitcoinDisplayUnit(UX_DUST_FLOOR_SATS, 'sat')} ${satLabel}). The amount shown above was set to ${formatAmountInBitcoinDisplayUnit(UX_DUST_FLOOR_SATS, amountUnit)} ${amountUnitLabel}.`
    : null
  const changeFreeCopy = warning.isBumpedChangeFree
    ? 'The amount was increased so this payment does not leave change below the dust limit (change-free transfer).'
    : null

  return (
    <DesignBanner
      role="status"
      status="warning"
      title="Amount adjusted"
      description={raisedCopy ?? changeFreeCopy}
      optionalContent={
        raisedCopy != null && changeFreeCopy != null ? <p>{changeFreeCopy}</p> : undefined
      }
    />
  )
}
