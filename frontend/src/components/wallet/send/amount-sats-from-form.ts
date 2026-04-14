import { SATS_PER_BTC } from '@/lib/bitcoin-dust'
import type { SendAmountUnit } from '@/stores/sendStore'

export function amountSatsFromForm(
  amountStr: string,
  unit: SendAmountUnit,
): number {
  if (!amountStr) return 0
  return unit === 'btc'
    ? Math.floor(parseFloat(amountStr) * SATS_PER_BTC)
    : parseInt(amountStr, 10) || 0
}
