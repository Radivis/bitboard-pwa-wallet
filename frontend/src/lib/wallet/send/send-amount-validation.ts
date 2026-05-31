import { MAX_SAFE_SATS } from '@/lib/wallet/bitcoin-utils'

export function isValidSendAmountSats(amountSats: number): boolean {
  return (
    Number.isFinite(amountSats) &&
    Number.isInteger(amountSats) &&
    amountSats >= 1 &&
    amountSats <= MAX_SAFE_SATS
  )
}
