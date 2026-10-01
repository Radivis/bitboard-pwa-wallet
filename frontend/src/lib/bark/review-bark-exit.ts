import { parseBarkBoardAmountSats } from '@/lib/bark/review-bark-board'
import type { BarkExitFeeEstimate } from '@/workers/bark-api'

export type BarkExitMode = 'amount' | 'all'

export type BarkExitReview = {
  mode: BarkExitMode
  destinationAddress: string
  amountSats: number | null
  feeRateSatPerVb: number
  feeSats: number
  onchainAmountSats: number
  grossAmountSats: number
}

export type ReviewBarkExitDeps = {
  estimateSendOnchain: (
    address: string,
    amountSats: number,
    feeRateSatPerVb: number,
  ) => Promise<BarkExitFeeEstimate>
  estimateOffboardAll: (address: string, feeRateSatPerVb: number) => Promise<BarkExitFeeEstimate>
}

export { parseBarkBoardAmountSats as parseBarkExitAmountSats }

function requireDestination(address: string): string {
  const destinationAddress = address.trim()
  if (destinationAddress.length === 0) {
    throw new Error('On-chain receive address is not ready')
  }
  return destinationAddress
}

function reviewFromEstimate(
  mode: BarkExitMode,
  destinationAddress: string,
  amountSats: number | null,
  feeRateSatPerVb: number,
  estimate: BarkExitFeeEstimate,
): BarkExitReview {
  return {
    mode,
    destinationAddress,
    amountSats,
    feeRateSatPerVb,
    feeSats: estimate.feeSats,
    onchainAmountSats: estimate.netAmountSats,
    grossAmountSats: estimate.grossAmountSats,
  }
}

/** Estimates a chosen on-chain amount at the app fee rate. Does not send or reveal an address. */
export async function reviewBarkExitAmount(
  deps: ReviewBarkExitDeps,
  input: { destinationAddress: string; amountSats: number; feeRateSatPerVb: number },
): Promise<BarkExitReview> {
  const destinationAddress = requireDestination(input.destinationAddress)
  const estimate = await deps.estimateSendOnchain(
    destinationAddress,
    input.amountSats,
    input.feeRateSatPerVb,
  )
  return reviewFromEstimate(
    'amount',
    destinationAddress,
    input.amountSats,
    input.feeRateSatPerVb,
    estimate,
  )
}

/** Estimates offboarding every spendable VTXO at the app fee rate. Fees come out of that pile. */
export async function reviewBarkExitAll(
  deps: ReviewBarkExitDeps,
  input: { destinationAddress: string; feeRateSatPerVb: number },
): Promise<BarkExitReview> {
  const destinationAddress = requireDestination(input.destinationAddress)
  const estimate = await deps.estimateOffboardAll(destinationAddress, input.feeRateSatPerVb)
  return reviewFromEstimate('all', destinationAddress, null, input.feeRateSatPerVb, estimate)
}
