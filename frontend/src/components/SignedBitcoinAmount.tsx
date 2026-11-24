import { BitcoinAmountDisplay } from '@/components/BitcoinAmountDisplay'

/** Signed list amount. The unit control stops its own click so a parent card stays put. */
export function SignedBitcoinAmount({
  sign,
  amountSats,
  testId,
}: {
  sign: string
  amountSats: number
  testId?: string
}) {
  return (
    <span data-testid={testId} className="inline-flex items-baseline gap-1">
      {sign !== '' ? <span className="tabular-nums">{sign}</span> : null}
      <BitcoinAmountDisplay amountSats={amountSats} amountTypography="addresses" />
    </span>
  )
}
