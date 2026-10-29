import { FiatBtcAmountDisplay } from '@/components/FiatBtcAmountDisplay'
import { DesignBanner } from '@/components/design/DesignBanner'
import { useBarkPendingActionsQuery } from '@/hooks/useBarkPendingActionsQuery'
import { useMainnetFiatAmountProps } from '@/hooks/useMainnetFiatAmountProps'
import { truncateAddress } from '@/lib/wallet/bitcoin-utils'
import type { BarkPendingAction } from '@/workers/bark-api'

export function BarkPendingActionBanner() {
  const pendingActionsQuery = useBarkPendingActionsQuery()
  const pendingActions = pendingActionsQuery.data ?? []
  if (pendingActions.length === 0) return null

  return (
    <div className="space-y-2">
      {pendingActions.map((action) => (
        <BarkPendingActionRow key={`${action.kind}:${action.id}`} action={action} />
      ))}
    </div>
  )
}

function BarkPendingActionRow({ action }: { action: BarkPendingAction }) {
  const fiatAmount = useMainnetFiatAmountProps()
  const failed = action.error != null
  return (
    <DesignBanner
      status={failed ? 'error' : 'info'}
      role={failed ? 'alert' : 'status'}
      data-testid="bark-pending-action-banner"
      data-state={failed ? 'error' : 'pending'}
      title={action.title}
      description={action.status}
      optionalContent={
        <>
          <p data-testid="bark-pending-action-amount">
            <FiatBtcAmountDisplay
              amountSats={action.amountSats}
              showFiatLayout={fiatAmount.showFiatLayout}
              btcPriceInFiat={fiatAmount.btcPriceInFiat}
              currency={fiatAmount.currency}
              rateLoading={fiatAmount.rateLoading}
              isDetail
            />
          </p>
          {action.destination != null ? (
            <p className="design-type-regular text-muted-foreground" title={action.destination}>
              Destination:{' '}
              <span className="design-type-addresses">{truncateAddress(action.destination)}</span>
            </p>
          ) : null}
          {action.txid != null ? (
            <p className="design-type-regular text-muted-foreground" title={action.txid}>
              <span className="design-type-addresses">{truncateAddress(action.txid)}</span>
            </p>
          ) : null}
        </>
      }
    />
  )
}
