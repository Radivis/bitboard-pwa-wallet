import { describe, expect, it } from 'vitest'
import {
  BARK_ANCHOR_SWEEP_WARNING,
  BARK_CHECKPOINT_SEIZURE_WARNING,
  BARK_INTERNAL_SEIZURE_WARNING,
  BARK_LEAF_SEIZURE_WARNING,
  formatBarkExitSeizureWarning,
  mergeExitNodeSweepVtxoItems,
  readBarkExitChainNotices,
  seizureBannerSections,
  vtxoIdsMissingSpentOutput,
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

  it('keeps the spent output and still accepts an item saved without one', () => {
    const notices = JSON.stringify({
      exitNodeSweepVtxoItems: [
        { vtxoId: 'vtxo-legacy', nodeKind: 'checkpoint', spenderTxid: ANCHOR_SPENDER },
        {
          vtxoId: 'vtxo-a',
          nodeKind: 'checkpoint',
          spenderTxid: ANCHOR_SPENDER,
          spentTxid: LATER_SPENDER,
          spentVout: 1,
        },
      ],
    })

    expect(readBarkExitChainNotices(notices)).toEqual([
      {
        vtxoId: 'vtxo-a',
        nodeKind: 'checkpoint',
        spenderTxid: ANCHOR_SPENDER,
        spentTxid: LATER_SPENDER,
        spentVout: 1,
      },
      { vtxoId: 'vtxo-legacy', nodeKind: 'checkpoint', spenderTxid: ANCHOR_SPENDER },
    ])
  })

  it('rejects a spent output that is only half present', () => {
    const notices = JSON.stringify({
      exitNodeSweepVtxoItems: [
        { vtxoId: 'vtxo-a', nodeKind: 'checkpoint', spentTxid: ANCHOR_SPENDER },
      ],
    })

    expect(() => readBarkExitChainNotices(notices)).toThrow('Bark exit chain notices are invalid')
  })

  it('rejects an empty spending transaction id', () => {
    const notices = JSON.stringify({
      exitNodeSweepVtxoItems: [{ vtxoId: 'vtxo-a', nodeKind: 'anchor', spenderTxid: '' }],
    })

    expect(() => readBarkExitChainNotices(notices)).toThrow('Bark exit chain notices are invalid')
  })
})

describe('vtxoIdsMissingSpentOutput', () => {
  it('asks a later sync to fill in only the VTXOs that have no spent output', () => {
    expect(
      vtxoIdsMissingSpentOutput([
        {
          vtxoId: 'vtxo-a',
          nodeKind: 'checkpoint',
          spenderTxid: ANCHOR_SPENDER,
          spentTxid: LATER_SPENDER,
          spentVout: 0,
        },
        { vtxoId: 'vtxo-legacy', nodeKind: 'checkpoint', spenderTxid: ANCHOR_SPENDER },
        { vtxoId: 'vtxo-legacy', nodeKind: 'leaf' },
      ]),
    ).toEqual(['vtxo-legacy'])
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

describe('seizureBannerSections', () => {
  it('groups one section per spent output and keeps a legacy item at kind level', () => {
    const firstCheckpoint = '11'.repeat(32)
    const secondCheckpoint = '22'.repeat(32)
    const sections = seizureBannerSections([
      {
        vtxoId: 'vtxo-b',
        nodeKind: 'checkpoint',
        spenderTxid: ANCHOR_SPENDER,
        spentTxid: firstCheckpoint,
        spentVout: 0,
      },
      {
        vtxoId: 'vtxo-a',
        nodeKind: 'checkpoint',
        spenderTxid: LATER_SPENDER,
        spentTxid: firstCheckpoint,
        spentVout: 0,
      },
      {
        vtxoId: 'vtxo-c',
        nodeKind: 'checkpoint',
        spenderTxid: ANCHOR_SPENDER,
        spentTxid: secondCheckpoint,
        spentVout: 1,
      },
      { vtxoId: 'vtxo-legacy', nodeKind: 'checkpoint', spenderTxid: ANCHOR_SPENDER },
    ])

    expect(sections.map((section) => section.vtxoIds)).toEqual([
      ['vtxo-legacy'],
      ['vtxo-b', 'vtxo-a'],
      ['vtxo-c'],
    ])
    expect(sections[0]).toMatchObject({ spentTxid: null, spentVout: null })
    expect(formatBarkExitSeizureWarning(sections[0]!)).toBe(BARK_CHECKPOINT_SEIZURE_WARNING)
    expect(formatBarkExitSeizureWarning(sections[1]!)).toBe(
      `The checkpoint from an emergency exit with txid ${firstCheckpoint} output 0 was spent because the exit was not continued. These Bark VTXOs are spent, and this wallet cannot recover them.`,
    )
    expect(formatBarkExitSeizureWarning(sections[2]!)).toContain('output 1')
    expect(formatBarkExitSeizureWarning(sections[2]!)).toContain(secondCheckpoint)
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
