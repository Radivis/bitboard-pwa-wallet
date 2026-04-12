import { describe, expect, it } from 'vitest'
import { labVsizeFromWeight } from '@/lib/lab-tx-weight'
import type { MempoolEntry } from '@/workers/lab-api'
import { selectMempoolTxsForBlock } from '@/workers/lab-mining-template'

function makeEntry(
  params: Pick<MempoolEntry, 'txid' | 'feeSats' | 'weight' | 'inputs'>,
): MempoolEntry {
  const weight = params.weight
  return {
    signedTxHex: '00',
    txid: params.txid,
    sender: null,
    receiver: null,
    feeSats: params.feeSats,
    weight,
    vsize: labVsizeFromWeight(weight),
    inputs: params.inputs,
    inputsDetail: [],
    outputsDetail: [],
  }
}

describe('selectMempoolTxsForBlock', () => {
  it('returns empty for empty mempool', () => {
    expect(selectMempoolTxsForBlock([], 4000)).toEqual([])
  })

  it('includes non-conflicting txs that fit in the weight budget', () => {
    const a = makeEntry({
      txid: 'aa',
      feeSats: 100,
      weight: 400,
      inputs: [{ txid: 'f1', vout: 0 }],
    })
    const b = makeEntry({
      txid: 'bb',
      feeSats: 50,
      weight: 200,
      inputs: [{ txid: 'f2', vout: 0 }],
    })
    const selected = selectMempoolTxsForBlock([a, b], 4000)
    expect(selected.map((e) => e.txid).sort()).toEqual(['aa', 'bb'])
  })

  it('stops when no remaining tx fits in the remaining weight budget', () => {
    const a = makeEntry({
      txid: 'aa',
      feeSats: 1000,
      weight: 100,
      inputs: [{ txid: 'f1', vout: 0 }],
    })
    const b = makeEntry({
      txid: 'bb',
      feeSats: 500,
      weight: 100,
      inputs: [{ txid: 'f2', vout: 0 }],
    })
    const selected = selectMempoolTxsForBlock([a, b], 150)
    expect(selected.map((e) => e.txid)).toEqual(['aa'])
  })

  it('skips a high fee-rate tx that does not fit, then takes a lower fee-rate tx that fits', () => {
    const big = makeEntry({
      txid: 'big',
      feeSats: 10_000,
      weight: 200,
      inputs: [{ txid: 'f1', vout: 0 }],
    })
    const small = makeEntry({
      txid: 'small',
      feeSats: 100,
      weight: 50,
      inputs: [{ txid: 'f2', vout: 0 }],
    })
    const selected = selectMempoolTxsForBlock([big, small], 100)
    expect(selected.map((e) => e.txid)).toEqual(['small'])
  })

  it('excludes double-spend losers using fee rate (not only absolute fee)', () => {
    const winner = makeEntry({
      txid: 'win',
      feeSats: 100,
      weight: 100,
      inputs: [{ txid: 'shared', vout: 0 }],
    })
    const loser = makeEntry({
      txid: 'lose',
      feeSats: 90,
      weight: 100,
      inputs: [{ txid: 'shared', vout: 0 }],
    })
    const selected = selectMempoolTxsForBlock([loser, winner], 4000)
    expect(selected.map((e) => e.txid)).toEqual(['win'])
  })

  it('uses txid as tie-break when fee rates are equal', () => {
    const b = makeEntry({
      txid: 'bb',
      feeSats: 100,
      weight: 100,
      inputs: [{ txid: 'f1', vout: 0 }],
    })
    const a = makeEntry({
      txid: 'aa',
      feeSats: 100,
      weight: 100,
      inputs: [{ txid: 'f2', vout: 0 }],
    })
    const selected = selectMempoolTxsForBlock([b, a], 100)
    expect(selected.map((e) => e.txid)).toEqual(['aa'])
  })
})
