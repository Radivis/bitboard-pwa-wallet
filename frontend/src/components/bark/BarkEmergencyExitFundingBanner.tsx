import { Info } from 'lucide-react'
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
    <div
      className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
      role="status"
      data-testid="bark-emergency-exit-funding-banner"
    >
      <div className="flex items-start gap-2">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
        <p className="text-amber-800 dark:text-amber-300">
          {formatBarkEmergencyExitFundingBanner(status)}
        </p>
      </div>
    </div>
  )
}
