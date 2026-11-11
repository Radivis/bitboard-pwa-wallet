import {
  BARK_EMERGENCY_EXIT_BLOCKS_ACTION,
  barkEmergencyExitBlocksAmount,
} from '@/lib/bark/emergency-exit-blocks-action'
import { parseBarkBoardAmountSats } from '@/lib/bark/review-bark-board'
import type { BarkBalanceParts, BarkOffboardFeeEstimate } from '@/workers/bark-api'

export type BarkOffboardMode = 'amount' | 'all'

export type BarkOffboardReview = {
  mode: BarkOffboardMode
  destinationAddress: string
  amountSats: number | null
  feeSats: number
  onchainAmountSats: number
  grossAmountSats: number
}

export type ReviewBarkOffboardDeps = {
  estimateSendOnchain: (address: string, amountSats: number) => Promise<BarkOffboardFeeEstimate>
  estimateOffboardAll: (address: string) => Promise<BarkOffboardFeeEstimate>
  readBalance: () => Promise<Pick<BarkBalanceParts, 'spendableSats' | 'exitingSats'>>
}

export { parseBarkBoardAmountSats as parseBarkOffboardAmountSats }

function requireDestination(address: string): string {
  const destinationAddress = address.trim()
  if (destinationAddress.length === 0) {
    throw new Error('On-chain receive address is not ready')
  }
  return destinationAddress
}

function reviewFromEstimate(
  mode: BarkOffboardMode,
  destinationAddress: string,
  amountSats: number | null,
  estimate: BarkOffboardFeeEstimate,
): BarkOffboardReview {
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
export async function reviewBarkOffboardAmount(
  deps: ReviewBarkOffboardDeps,
  input: { destinationAddress: string; amountSats: number },
): Promise<BarkOffboardReview> {
  const destinationAddress = requireDestination(input.destinationAddress)
  const balance = await deps.readBalance()
  if (
    barkEmergencyExitBlocksAmount({
      amountSats: input.amountSats,
      spendableSats: balance.spendableSats,
      exitingSats: balance.exitingSats,
    })
  ) {
    throw new Error(BARK_EMERGENCY_EXIT_BLOCKS_ACTION)
  }
  const estimate = await deps.estimateSendOnchain(destinationAddress, input.amountSats)
  return reviewFromEstimate('amount', destinationAddress, input.amountSats, estimate)
}

/** Estimates offboarding every spendable VTXO. The server fee comes out of that pile. */
export async function reviewBarkOffboardAll(
  deps: ReviewBarkOffboardDeps,
  input: { destinationAddress: string },
): Promise<BarkOffboardReview> {
  const destinationAddress = requireDestination(input.destinationAddress)
  const estimate = await deps.estimateOffboardAll(destinationAddress)
  return reviewFromEstimate('all', destinationAddress, null, estimate)
}
