import { isCoinbase } from '@/lib/lab-operations'
import type { LabTxDetails } from '@/workers/lab-api'

/**
 * Fee in sats from persisted tx details (inputs minus outputs). Coinbase returns 0.
 * Matches {@link feeFromTxDetails} in lab-mining-template (worker).
 */
export function feeSatsFromTxDetails(tx: LabTxDetails): number {
  if (isCoinbase(tx)) return 0
  const totalInputs = tx.inputs.reduce((sum, input) => sum + input.amountSats, 0)
  const totalOutputs = tx.outputs.reduce((sum, output) => sum + output.amountSats, 0)
  return Math.max(totalInputs - totalOutputs, 0)
}
