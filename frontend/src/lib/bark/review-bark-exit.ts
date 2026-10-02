import { parseBarkBoardAmountSats } from '@/lib/bark/review-bark-board'
import type { BarkExitFeeEstimate } from '@/workers/bark-api'

export type BarkExitMode = 'amount' | 'all'

export type BarkExitReview = {
  mode: BarkExitMode
  destinationAddress: string
  amountSats: number | null
  feeSats: number
  onchainAmountSats: number
  grossAmountSats: number
}

export type ReviewBarkExitDeps = {
  estimateSendOnchain: (address: string, amountSats: number) => Promise<BarkExitFeeEstimate>
  estimateOffboardAll: (address: string) => Promise<BarkExitFeeEstimate>
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
  estimate: BarkExitFeeEstimate,
): BarkExitReview {
  return {
    mode,
    destinationAddress,
    amountSats,
    feeSats: estimate.feeSats,
    onchainAmountSats: estimate.netAmountSats,
    grossAmountSats: estimate.grossAmountSats,
  }
}

/** Estimates a chosen on-chain amount at the server offboard fee rate. Does not send. */
export async function reviewBarkExitAmount(
  deps: ReviewBarkExitDeps,
  input: { destinationAddress: string; amountSats: number },
): Promise<BarkExitReview> {
  const destinationAddress = requireDestination(input.destinationAddress)
  const estimate = await deps.estimateSendOnchain(destinationAddress, input.amountSats)
  return reviewFromEstimate('amount', destinationAddress, input.amountSats, estimate)
}

/** Estimates offboarding every spendable VTXO. The server fee comes out of that pile. */
export async function reviewBarkExitAll(
  deps: ReviewBarkExitDeps,
  input: { destinationAddress: string },
): Promise<BarkExitReview> {
  const destinationAddress = requireDestination(input.destinationAddress)
  const estimate = await deps.estimateOffboardAll(destinationAddress)
  return reviewFromEstimate('all', destinationAddress, null, estimate)
}
