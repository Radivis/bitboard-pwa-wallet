import { describe, expect, it } from 'vitest'
import {
  BARK_ANCHOR_SWEEP_WARNING,
  BARK_CHECKPOINT_SEIZURE_WARNING,
  BARK_INTERNAL_SEIZURE_WARNING,
  BARK_LEAF_SEIZURE_WARNING,
  mergeExitNodeSweepVtxoItems,
  readBarkExitChainNotices,
} from '@/lib/bark/bark-exit-seizure'

const ANCHOR_SPENDER = 'aa'.repeat(32)
const LATER_SPENDER = 'cc'.repeat(32)

describe('readBarkExitChainNotices', () => {
  it('keeps the spending transaction and still accepts an item saved without one', () => {
    const notices = JSON.stringify({
      exitNodeSweepVtxoItems: [
        { vtxoId: 'vtxo-b', nodeKind: 'leaf' },
        { vtxoId: 'vtxo-a', nodeKind: 'anchor', spenderTxid: ANCHOR_SPENDER },
      ],
    })

    expect(readBarkExitChainNotices(notices)).toEqual([
      { vtxoId: 'vtxo-a', nodeKind: 'anchor', spenderTxid: ANCHOR_SPENDER },
      { vtxoId: 'vtxo-b', nodeKind: 'leaf' },
    ])
  })

  it('rejects an empty spending transaction id', () => {
    const notices = JSON.stringify({
      exitNodeSweepVtxoItems: [{ vtxoId: 'vtxo-a', nodeKind: 'anchor', spenderTxid: '' }],
    })

    expect(() => readBarkExitChainNotices(notices)).toThrow('Bark exit chain notices are invalid')
  })
})

describe('mergeExitNodeSweepVtxoItems', () => {
  it('keeps the item that has a spending transaction when the same vtxo and kind lacks one', () => {
    expect(
      mergeExitNodeSweepVtxoItems(
        [{ vtxoId: 'vtxo-a', nodeKind: 'anchor' }],
        [{ vtxoId: 'vtxo-a', nodeKind: 'anchor', spenderTxid: ANCHOR_SPENDER }],
      ),
    ).toEqual([{ vtxoId: 'vtxo-a', nodeKind: 'anchor', spenderTxid: ANCHOR_SPENDER }])
  })

  it('keeps two spends of the same kind as two items', () => {
    expect(
      mergeExitNodeSweepVtxoItems(
        [{ vtxoId: 'vtxo-a', nodeKind: 'internal', spenderTxid: LATER_SPENDER }],
        [{ vtxoId: 'vtxo-a', nodeKind: 'internal', spenderTxid: ANCHOR_SPENDER }],
      ),
    ).toEqual([
      { vtxoId: 'vtxo-a', nodeKind: 'internal', spenderTxid: ANCHOR_SPENDER },
      { vtxoId: 'vtxo-a', nodeKind: 'internal', spenderTxid: LATER_SPENDER },
    ])
  })
})

describe('seizure warnings', () => {
  it('names Bark VTXOs', () => {
    for (const warning of [
      BARK_ANCHOR_SWEEP_WARNING,
      BARK_INTERNAL_SEIZURE_WARNING,
      BARK_LEAF_SEIZURE_WARNING,
      BARK_CHECKPOINT_SEIZURE_WARNING,
    ]) {
      expect(warning).toContain('Bark VTXOs')
      expect(warning.split('Bark VTXOs').join('')).not.toContain('VTXO')
    }
  })
})
