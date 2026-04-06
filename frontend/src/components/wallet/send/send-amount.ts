import { MAX_SAFE_SATS } from '@/lib/bitcoin-utils'

export function isValidSendAmountSats(n: number): boolean {
  return (
    Number.isFinite(n) &&
    Number.isInteger(n) &&
    n >= 1 &&
    n <= MAX_SAFE_SATS
  )
}
