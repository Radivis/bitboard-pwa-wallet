import type { SendAmountUnit } from '@/stores/sendStore'
import { parseAmountToSatsFromBitcoinDisplayUnit } from '@/lib/bitcoin-display-unit'

export function amountSatsFromForm(
  amountStr: string,
  unit: SendAmountUnit,
): number {
  return parseAmountToSatsFromBitcoinDisplayUnit(amountStr, unit)
}
