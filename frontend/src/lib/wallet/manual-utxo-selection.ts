import type { ReviewInputUtxo, UtxoOutpoint } from '@/workers/crypto-api'

/** Matches `crypto/src/transaction.rs` manual coin-control empty-selection error. */
export const MANUAL_COIN_CONTROL_EMPTY_SELECTION_MESSAGE =
  'At least one UTXO must be selected for manual coin control'

/**
 * Wire manual selection to WASM: `undefined` → auto coin selection; `[]` → manual mode with
 * no inputs (prepare must fail); non-empty → explicit outpoints.
 */
export function serializeSelectedOutpointsForWasm(
  selectedOutpoints: UtxoOutpoint[] | undefined,
): string | null {
  if (selectedOutpoints == null) {
    return null
  }
  return JSON.stringify(
    selectedOutpoints.map((outpoint) => ({
      txid: outpoint.txid,
      vout: outpoint.vout,
    })),
  )
}

export function utxoOutpointKey(utxo: Pick<ReviewInputUtxo, 'txid' | 'vout'>): string {
  return `${utxo.txid}:${utxo.vout}`
}

export function reviewUtxoToOutpoint(utxo: ReviewInputUtxo): UtxoOutpoint {
  return { txid: utxo.txid, vout: utxo.vout }
}

export function sumReviewUtxoAmountSats(utxos: ReviewInputUtxo[]): number {
  return utxos.reduce((sum, utxo) => sum + utxo.amountSats, 0)
}

export function isManualUtxoSelectionSufficient(
  selectedSumSats: number,
  amountSats: number,
  feeSats: number | null,
): boolean {
  if (feeSats == null) {
    return false
  }
  return selectedSumSats >= amountSats + feeSats
}

export function splitUtxosBySelection(
  allUtxos: ReviewInputUtxo[],
  selectedUtxos: ReviewInputUtxo[],
): { selected: ReviewInputUtxo[]; available: ReviewInputUtxo[] } {
  const selectedKeys = new Set(selectedUtxos.map(utxoOutpointKey))
  const available = allUtxos.filter((utxo) => !selectedKeys.has(utxoOutpointKey(utxo)))
  return { selected: [...selectedUtxos], available }
}

export function moveUtxoToSelected(
  selectedUtxos: ReviewInputUtxo[],
  availableUtxos: ReviewInputUtxo[],
  utxo: ReviewInputUtxo,
): { selected: ReviewInputUtxo[]; available: ReviewInputUtxo[] } {
  return {
    selected: [...selectedUtxos, utxo],
    available: availableUtxos.filter(
      (candidate) => utxoOutpointKey(candidate) !== utxoOutpointKey(utxo),
    ),
  }
}

export function moveUtxoToAvailable(
  selectedUtxos: ReviewInputUtxo[],
  availableUtxos: ReviewInputUtxo[],
  utxo: ReviewInputUtxo,
): { selected: ReviewInputUtxo[]; available: ReviewInputUtxo[] } {
  return {
    selected: selectedUtxos.filter(
      (candidate) => utxoOutpointKey(candidate) !== utxoOutpointKey(utxo),
    ),
    available: [...availableUtxos, utxo],
  }
}
