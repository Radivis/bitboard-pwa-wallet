import { readBarkBoardFeeEstimate } from '@/lib/bark/bark-board-wasm'
import type { BitboardBarkWasm } from '@/lib/bark/load-bitboard-bark-wasm'
import type { BarkOffboardFeeEstimate } from '@/workers/bark-api'

export type BarkOffboardWasm = Pick<
  BitboardBarkWasm,
  | 'bark_estimate_send_onchain'
  | 'bark_send_onchain'
  | 'bark_estimate_offboard_all'
  | 'bark_offboard_all'
>

function requireOffboardAmount(amountSats: number): void {
  if (!Number.isSafeInteger(amountSats) || amountSats <= 0) {
    throw new Error('Bark exit amount is invalid')
  }
}

function requireOffboardAddress(address: string): string {
  const trimmed = address.trim()
  if (trimmed.length === 0) {
    throw new Error('Bark exit address is invalid')
  }
  return trimmed
}

function requireTxid(txid: string): string {
  if (typeof txid !== 'string' || txid.length === 0) {
    throw new Error('Bark exit did not return a txid')
  }
  return txid
}

export async function estimateSendOnchainFromWasm(
  wasm: BarkOffboardWasm,
  address: string,
  amountSats: number,
): Promise<BarkOffboardFeeEstimate> {
  requireOffboardAmount(amountSats)
  return readBarkBoardFeeEstimate(
    await wasm.bark_estimate_send_onchain(requireOffboardAddress(address), BigInt(amountSats)),
  )
}

export async function sendOnchainFromWasm(
  wasm: BarkOffboardWasm,
  address: string,
  amountSats: number,
): Promise<string> {
  requireOffboardAmount(amountSats)
  return requireTxid(
    await wasm.bark_send_onchain(requireOffboardAddress(address), BigInt(amountSats)),
  )
}

export async function estimateOffboardAllFromWasm(
  wasm: BarkOffboardWasm,
  address: string,
): Promise<BarkOffboardFeeEstimate> {
  return readBarkBoardFeeEstimate(
    await wasm.bark_estimate_offboard_all(requireOffboardAddress(address)),
  )
}

export async function offboardAllFromWasm(wasm: BarkOffboardWasm, address: string): Promise<string> {
  return requireTxid(await wasm.bark_offboard_all(requireOffboardAddress(address)))
}
