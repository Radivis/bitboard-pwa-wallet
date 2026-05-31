import { describe, expect, it } from 'vitest'
import {
  filterUtxosBySelectedOutpoints,
  isManualUtxoSelectionSufficient,
  moveUtxoToAvailable,
  moveUtxoToSelected,
  serializeSelectedOutpointsForWasm,
  splitUtxosBySelection,
  sumReviewUtxoAmountSats,
  utxoOutpointKey,
} from '@/lib/wallet/manual-utxo-selection'
import type { ReviewInputUtxo } from '@/workers/crypto-api'

const utxoA: ReviewInputUtxo = {
  address: 'addr-a',
  amountSats: 50_000,
  txid: 'aaa',
  vout: 0,
}

const utxoB: ReviewInputUtxo = {
  address: 'addr-b',
  amountSats: 30_000,
  txid: 'bbb',
  vout: 1,
}

describe('manual-utxo-selection helpers', () => {
  it('builds stable outpoint keys', () => {
    expect(utxoOutpointKey(utxoA)).toBe('aaa:0')
  })

  it('serializes selected outpoints for WASM without coercing empty to auto', () => {
    expect(serializeSelectedOutpointsForWasm(undefined)).toBeNull()
    expect(serializeSelectedOutpointsForWasm([])).toBe('[]')
    expect(serializeSelectedOutpointsForWasm([{ txid: 'aaa', vout: 0 }])).toBe(
      JSON.stringify([{ txid: 'aaa', vout: 0 }]),
    )
  })

  it('sums selected amounts', () => {
    expect(sumReviewUtxoAmountSats([utxoA, utxoB])).toBe(80_000)
  })

  it('checks sufficiency against amount plus fee', () => {
    expect(isManualUtxoSelectionSufficient(10_500, 10_000, 500)).toBe(true)
    expect(isManualUtxoSelectionSufficient(10_400, 10_000, 500)).toBe(false)
    expect(isManualUtxoSelectionSufficient(10_500, 10_000, null)).toBe(false)
  })

  it('splits all utxos into selected and available', () => {
    const { selected, available } = splitUtxosBySelection([utxoA, utxoB], [utxoA])
    expect(selected).toEqual([utxoA])
    expect(available).toEqual([utxoB])
  })

  it('filterUtxosBySelectedOutpoints returns all when selection omitted', () => {
    expect(filterUtxosBySelectedOutpoints([utxoA, utxoB], undefined)).toEqual([utxoA, utxoB])
    expect(filterUtxosBySelectedOutpoints([utxoA, utxoB], null)).toEqual([utxoA, utxoB])
  })

  it('filterUtxosBySelectedOutpoints returns subset for explicit outpoints', () => {
    expect(
      filterUtxosBySelectedOutpoints([utxoA, utxoB], [{ txid: 'aaa', vout: 0 }]),
    ).toEqual([utxoA])
  })

  it('filterUtxosBySelectedOutpoints returns empty for empty selection list', () => {
    expect(filterUtxosBySelectedOutpoints([utxoA, utxoB], [])).toEqual([])
  })

  it('moves utxos between selected and available lists', () => {
    const added = moveUtxoToSelected([], [utxoB], utxoB)
    expect(added.selected).toEqual([utxoB])
    expect(added.available).toEqual([])

    const removed = moveUtxoToAvailable([utxoA, utxoB], [], utxoA)
    expect(removed.selected).toEqual([utxoB])
    expect(removed.available).toEqual([utxoA])
  })
})
