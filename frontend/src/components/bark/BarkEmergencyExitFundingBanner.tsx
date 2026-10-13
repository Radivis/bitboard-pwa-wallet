import { BarkInfoNotice } from '@/components/bark/BarkInfoNotice'
import {
  formatBarkEmergencyExitFundingBanner,
  type BarkEmergencyExitFundingStatus,
} from '@/lib/bark/bark-emergency-exit-funding-status'

/** Some exit transactions are waiting for a confirmed coin to pay their child. */
export function BarkEmergencyExitFundingBanner({
  status,
}: {
  status: BarkEmergencyExitFundingStatus | null
}) {
  if (status == null) return null

  return (
    <BarkInfoNotice data-testid="bark-emergency-exit-funding-banner">
      {formatBarkEmergencyExitFundingBanner(status)}
    </BarkInfoNotice>
  )
}
