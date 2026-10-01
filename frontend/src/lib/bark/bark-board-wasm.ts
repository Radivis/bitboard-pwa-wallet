import type {
  BarkBoardAccepted,
  BarkBoardFeeEstimate,
  BarkPreparedBoardFunding,
} from '@/workers/bark-api'

type WasmBoardObject = {
  funding_address?: unknown
  expiry_height?: unknown
  gross_amount_sats?: unknown
  fee_sats?: unknown
  net_amount_sats?: unknown
  funding_txid?: unknown
  vtxo_amount_sats?: unknown
  movement_id?: unknown
  free?: () => void
}

export function readBarkPreparedBoardFunding(
  value: WasmBoardObject,
): BarkPreparedBoardFunding {
  try {
    return {
      fundingAddress: readNonEmptyString(value.funding_address, 'Bark board funding address'),
      expiryHeight: readNonNegativeInteger(value.expiry_height, 'Bark board expiry height'),
    }
  } finally {
    value.free?.()
  }
}

export function readBarkBoardFeeEstimate(value: WasmBoardObject): BarkBoardFeeEstimate {
  try {
    return {
      grossAmountSats: readNonNegativeInteger(value.gross_amount_sats, 'Bark board gross amount'),
      feeSats: readNonNegativeInteger(value.fee_sats, 'Bark board fee'),
      netAmountSats: readNonNegativeInteger(value.net_amount_sats, 'Bark board net amount'),
    }
  } finally {
    value.free?.()
  }
}

export function readBarkBoardAccepted(value: WasmBoardObject): BarkBoardAccepted {
  try {
    return {
      fundingTxid: readNonEmptyString(value.funding_txid, 'Bark board funding txid'),
      vtxoAmountSats: readNonNegativeInteger(value.vtxo_amount_sats, 'Bark board VTXO amount'),
      movementId: readNonNegativeInteger(value.movement_id, 'Bark board movement id'),
    }
  } finally {
    value.free?.()
  }
}

function readNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} was missing`)
  }
  return value
}

function readNonNegativeInteger(value: unknown, label: string): number {
  const parsed = typeof value === 'bigint' || typeof value === 'number' ? Number(value) : Number.NaN
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${label} was not a safe integer`)
  }
  return parsed
}
