import {
  readBarkBoardAccepted,
  readBarkBoardFeeEstimate,
  readBarkPreparedBoardFunding,
} from '@/lib/bark/bark-board-wasm'
import { readBarkHistoryJson } from '@/lib/bark/bark-history'
import type { BitboardBarkWasm } from '@/lib/bark/load-bitboard-bark-wasm'
import type {
  BarkBoardAccepted,
  BarkBoardFeeEstimate,
  BarkMovementRow,
  BarkPreparedBoardFunding,
} from '@/workers/bark-api'

export type BarkBoardWasm = Pick<
  BitboardBarkWasm,
  | 'bark_estimate_board_offchain_fee'
  | 'bark_prepare_board_funding'
  | 'bark_board_psbt'
  | 'bark_history'
>

/** Fee estimate only. Does not derive a VTXO key or touch the receive cursor. */
export async function estimateBoardOffchainFeeFromWasm(
  wasm: BarkBoardWasm,
  amountSats: number,
): Promise<BarkBoardFeeEstimate> {
  if (!Number.isSafeInteger(amountSats) || amountSats <= 0) {
    throw new Error('Bark board amount is invalid')
  }
  return readBarkBoardFeeEstimate(
    await wasm.bark_estimate_board_offchain_fee(BigInt(amountSats)),
  )
}

/** Derives the next VTXO key inside WASM and returns only the funding address. */
export async function prepareBoardFundingFromWasm(
  wasm: BarkBoardWasm,
): Promise<BarkPreparedBoardFunding> {
  return readBarkPreparedBoardFunding(await wasm.bark_prepare_board_funding())
}

export async function boardPsbtFromWasm(
  wasm: BarkBoardWasm,
  psbtBase64: string,
): Promise<BarkBoardAccepted> {
  return readBarkBoardAccepted(await wasm.bark_board_psbt(psbtBase64))
}

export async function historyFromWasm(wasm: BarkBoardWasm): Promise<BarkMovementRow[]> {
  return readBarkHistoryJson(await wasm.bark_history())
}
