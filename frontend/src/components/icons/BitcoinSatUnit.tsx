import { SatoshiIcon } from '@/components/icons/SatoshiIcon'
import { NetworkUnitPrefix } from '@/components/NetworkUnitPrefix'
import type { NetworkUnitIndicator } from '@/lib/wallet/bitcoin-display-unit'
import { cn } from '@/lib/shared/utils'

type BitcoinSatUnitProps = {
  indicator: NetworkUnitIndicator
  /** ksat is 1,000 sats, shown as k plus the satoshi mark. */
  kilo?: boolean
  className?: string
}

/**
 * Satoshi unit on an amount. The mark is visual; the word stays in the
 * accessibility tree and in textContent so amount parsing still sees `sat`
 * or `ksat`. Children are an array so JSX indentation cannot insert a space
 * between the network prefix, the kilo `k`, and that word.
 */
export function BitcoinSatUnit({ indicator, kilo = false, className }: BitcoinSatUnitProps) {
  return (
    <span data-testid="bitcoin-sat-unit" className={cn('inline-flex items-baseline', className)}>
      {[
        <NetworkUnitPrefix key="network" indicator={indicator} />,
        kilo ? <span key="kilo">k</span> : null,
        <SatoshiIcon key="mark" />,
        <span key="word" className="sr-only">sat</span>,
      ]}
    </span>
  )
}
