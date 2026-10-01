import { readBarkBoardFeeEstimate } from '@/lib/bark/bark-board-wasm'
import type { BarkExitFeeEstimate } from '@/workers/bark-api'

type WasmFeeEstimate = {
  gross_amount_sats?: unknown
  fee_sats?: unknown
  net_amount_sats?: unknown
  free?: () => void
}

export type BarkExitWasm = {
  bark_estimate_send_onchain(
    address: string,
    amountSats: bigint,
    feeRateSatPerVb: number,
  ): Promise<WasmFeeEstimate>
  bark_send_onchain(address: string, amountSats: bigint, feeRateSatPerVb: number): Promise<string>
  bark_estimate_offboard_all(address: string, feeRateSatPerVb: number): Promise<WasmFeeEstimate>
  bark_offboard_all(address: string, feeRateSatPerVb: number): Promise<string>
}

function requireExitAmount(amountSats: number): void {
  if (!Number.isSafeInteger(amountSats) || amountSats <= 0) {
    throw new Error('Bark exit amount is invalid')
  }
}

function requireExitAddress(address: string): string {
  const trimmed = address.trim()
  if (trimmed.length === 0) {
    throw new Error('Bark exit address is invalid')
  }
  return trimmed
}

function requireFeeRate(feeRateSatPerVb: number): number {
  if (!Number.isFinite(feeRateSatPerVb) || feeRateSatPerVb <= 0) {
    throw new Error('Bark exit fee rate is invalid')
  }
  return feeRateSatPerVb
}

function requireTxid(txid: string): string {
  if (typeof txid !== 'string' || txid.length === 0) {
    throw new Error('Bark exit did not return a txid')
  }
  return txid
}

export async function estimateSendOnchainFromWasm(
  wasm: BarkExitWasm,
  address: string,
  amountSats: number,
  feeRateSatPerVb: number,
): Promise<BarkExitFeeEstimate> {
  requireExitAmount(amountSats)
  return readBarkBoardFeeEstimate(
    await wasm.bark_estimate_send_onchain(
      requireExitAddress(address),
      BigInt(amountSats),
      requireFeeRate(feeRateSatPerVb),
    ),
  )
}

export async function sendOnchainFromWasm(
  wasm: BarkExitWasm,
  address: string,
  amountSats: number,
  feeRateSatPerVb: number,
): Promise<string> {
  requireExitAmount(amountSats)
  return requireTxid(
    await wasm.bark_send_onchain(
      requireExitAddress(address),
      BigInt(amountSats),
      requireFeeRate(feeRateSatPerVb),
    ),
  )
}

export async function estimateOffboardAllFromWasm(
  wasm: BarkExitWasm,
  address: string,
  feeRateSatPerVb: number,
): Promise<BarkExitFeeEstimate> {
  return readBarkBoardFeeEstimate(
    await wasm.bark_estimate_offboard_all(requireExitAddress(address), requireFeeRate(feeRateSatPerVb)),
  )
}

export async function offboardAllFromWasm(
  wasm: BarkExitWasm,
  address: string,
  feeRateSatPerVb: number,
): Promise<string> {
  return requireTxid(
    await wasm.bark_offboard_all(requireExitAddress(address), requireFeeRate(feeRateSatPerVb)),
  )
}
