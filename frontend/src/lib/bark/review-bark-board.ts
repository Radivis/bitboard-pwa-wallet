import type { BarkBoardFeeEstimate, BarkPreparedBoardFunding } from '@/workers/bark-api'

export type BarkBoardReview = {
  fundingAddress: string
  psbtBase64: string
  onchainFeeSats: number
  offchainFeeSats: number
  netVtxoSats: number
  grossAmountSats: number
}

export type ReviewBarkBoardDeps = {
  estimateBoardOffchainFee: (amountSats: number) => Promise<BarkBoardFeeEstimate>
  prepareBoardFunding: () => Promise<BarkPreparedBoardFunding>
  prepareOnchainSend: (params: {
    toAddress: string
    amountSats: number
    feeRateSatPerVb: number
  }) => Promise<{ psbtBase64: string; feeSats: number }>
}

/** Positive whole sats. Rejects empty input, zero, fractions, and leading zeros. */
export function parseBarkBoardAmountSats(raw: string): number | null {
  const trimmed = raw.trim()
  if (!/^[1-9]\d*$/.test(trimmed)) return null
  const amountSats = Number(trimmed)
  if (!Number.isSafeInteger(amountSats) || amountSats <= 0) return null
  return amountSats
}

/**
 * Estimates the server fee before deriving a VTXO key, then builds the on-chain PSBT
 * to that funding address. Does not sign or broadcast.
 */
export async function reviewBarkBoard(
  deps: ReviewBarkBoardDeps,
  input: { amountSats: number; feeRateSatPerVb: number },
): Promise<BarkBoardReview> {
  const estimate = await deps.estimateBoardOffchainFee(input.amountSats)
  const prepared = await deps.prepareBoardFunding()
  const onchain = await deps.prepareOnchainSend({
    toAddress: prepared.fundingAddress,
    amountSats: input.amountSats,
    feeRateSatPerVb: input.feeRateSatPerVb,
  })
  return {
    fundingAddress: prepared.fundingAddress,
    psbtBase64: onchain.psbtBase64,
    onchainFeeSats: onchain.feeSats,
    offchainFeeSats: estimate.feeSats,
    netVtxoSats: estimate.netAmountSats,
    grossAmountSats: estimate.grossAmountSats,
  }
}
