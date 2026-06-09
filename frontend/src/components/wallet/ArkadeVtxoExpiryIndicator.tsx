import { formatDistanceToNow } from 'date-fns'
import { Clock, Loader2 } from 'lucide-react'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { useArkadeVtxoExpiryQuery } from '@/hooks/useArkadeQueries'
import { formatArkadeVtxoExpiryIndicator } from '@/lib/arkade/arkade-vtxo-expiry-display'
import {
  ARKADE_INFOMODE_IDS,
  ARKADE_VTXO_EXPIRY_INDICATOR_INFOMODE,
} from '@/lib/arkade/arkade-infomode'
import { cn } from '@/lib/shared/utils'

export function ArkadeVtxoExpiryIndicator() {
  const expiryQuery = useArkadeVtxoExpiryQuery()

  if (expiryQuery.isLoading) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
        Checking VTXO expiry…
      </p>
    )
  }

  if (expiryQuery.isError || expiryQuery.data == null) {
    return null
  }

  const indicatorText = formatArkadeVtxoExpiryIndicator(expiryQuery.data)
  if (indicatorText == null) {
    return null
  }

  const needsRenewalSoon = expiryQuery.data.expiringSoonCount > 0
  const expiryDate =
    expiryQuery.data.earliestExpiresAt != null
      ? new Date(expiryQuery.data.earliestExpiresAt * 1000)
      : null

  return (
    <InfomodeWrapper
      infoId={ARKADE_INFOMODE_IDS.vtxoExpiryIndicator}
      infoTitle={ARKADE_VTXO_EXPIRY_INDICATOR_INFOMODE.title}
      infoText={ARKADE_VTXO_EXPIRY_INDICATOR_INFOMODE.text}
      as="span"
    >
      <p
        className={cn(
          'flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs',
          needsRenewalSoon
            ? 'text-amber-700 dark:text-amber-400'
            : 'text-muted-foreground',
        )}
        data-testid="arkade-vtxo-expiry-indicator"
        title={
          expiryDate != null
            ? `Earliest virtual balance unit expires ${formatDistanceToNow(expiryDate, { addSuffix: true })}`
            : undefined
        }
      >
        <Clock className="h-3 w-3 shrink-0" aria-hidden />
        <span>{indicatorText.primary}</span>
        {indicatorText.renewalSoonSuffix != null ? (
          <span className="font-medium">· {indicatorText.renewalSoonSuffix}</span>
        ) : null}
      </p>
    </InfomodeWrapper>
  )
}
