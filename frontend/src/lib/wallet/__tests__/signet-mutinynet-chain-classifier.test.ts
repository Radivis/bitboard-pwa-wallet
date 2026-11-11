import { describe, expect, it } from 'vitest'
import {
  classifyChangesetChains,
  descriptorChangesetContradictsNetwork,
  SIGNET_MUTINYNET_HEIGHT_BOUNDARY,
} from '@/lib/wallet/signet-mutinynet-chain-classifier'
import {
  bdkChangesetJson,
  MUTINYNET_ANCHOR_HEIGHT,
  MUTINYNET_TIP_HEIGHT,
  PUBLIC_SIGNET_ANCHOR_HEIGHT,
  PUBLIC_SIGNET_TIP_HEIGHT,
} from '@/test-utils/bdk-changeset-json-fixtures'

describe('classifyChangesetChains', () => {
  it('classifies a genesis-only changeset as having no chain', () => {
    expect(classifyChangesetChains(bdkChangesetJson({ blockHeights: [0] }))).toEqual({
      kind: 'classified',
      chains: new Set(),
    })
  })

  it('classifies anchors at or above the boundary as Mutinynet', () => {
    const changeSetJson = bdkChangesetJson({
      blockHeights: [0, SIGNET_MUTINYNET_HEIGHT_BOUNDARY],
      anchorHeights: [SIGNET_MUTINYNET_HEIGHT_BOUNDARY],
    })
    expect(classifyChangesetChains(changeSetJson)).toEqual({
      kind: 'classified',
      chains: new Set(['mutinynet']),
    })
  })

  it('classifies anchors below the boundary under a public Signet tip as public Signet', () => {
    const changeSetJson = bdkChangesetJson({
      blockHeights: [0, PUBLIC_SIGNET_ANCHOR_HEIGHT, PUBLIC_SIGNET_TIP_HEIGHT],
      anchorHeights: [PUBLIC_SIGNET_ANCHOR_HEIGHT],
    })
    expect(classifyChangesetChains(changeSetJson)).toEqual({
      kind: 'classified',
      chains: new Set(['signet']),
    })
  })

  it('classifies a tip at or above the boundary without anchors as Mutinynet', () => {
    const changeSetJson = bdkChangesetJson({ blockHeights: [0, MUTINYNET_TIP_HEIGHT] })
    expect(classifyChangesetChains(changeSetJson)).toEqual({
      kind: 'classified',
      chains: new Set(['mutinynet']),
    })
  })

  it('ignores removed (null) checkpoints when finding the tip', () => {
    const changeSetJson = bdkChangesetJson({
      blockHeights: [0, PUBLIC_SIGNET_TIP_HEIGHT],
      removedBlockHeights: [MUTINYNET_TIP_HEIGHT],
    })
    expect(classifyChangesetChains(changeSetJson)).toEqual({
      kind: 'classified',
      chains: new Set(['signet']),
    })
  })

  it('returns unknown for malformed JSON', () => {
    expect(classifyChangesetChains('{not json')).toEqual({ kind: 'unknown' })
    expect(classifyChangesetChains('')).toEqual({ kind: 'unknown' })
  })

  it('returns unknown for unexpected shapes', () => {
    const unexpectedShapes = [
      '{}',
      'null',
      '[]',
      JSON.stringify({ local_chain: { blocks: [] }, tx_graph: { anchors: [] } }),
      JSON.stringify({ local_chain: { blocks: { abc: null } }, tx_graph: { anchors: [] } }),
      JSON.stringify({ local_chain: { blocks: { '0': 42 } }, tx_graph: { anchors: [] } }),
      JSON.stringify({ local_chain: { blocks: {} }, tx_graph: {} }),
      JSON.stringify({
        local_chain: { blocks: {} },
        tx_graph: { anchors: [[{ block_id: { height: '5' } }, 'txid']] },
      }),
      JSON.stringify({ local_chain: { blocks: {} }, tx_graph: { anchors: [{}] } }),
    ]
    for (const changeSetJson of unexpectedShapes) {
      expect(classifyChangesetChains(changeSetJson), changeSetJson).toEqual({ kind: 'unknown' })
    }
  })
})

describe('descriptorChangesetContradictsNetwork', () => {
  it('never contradicts a genesis-only row', () => {
    const changeSetJson = bdkChangesetJson({ blockHeights: [0] })
    expect(descriptorChangesetContradictsNetwork(changeSetJson, 'signet')).toBe(false)
    expect(descriptorChangesetContradictsNetwork(changeSetJson, 'mutinynet')).toBe(false)
  })

  it('contradicts the other network only', () => {
    const mutinynetJson = bdkChangesetJson({
      blockHeights: [0, MUTINYNET_ANCHOR_HEIGHT, MUTINYNET_TIP_HEIGHT],
      anchorHeights: [MUTINYNET_ANCHOR_HEIGHT],
    })
    expect(descriptorChangesetContradictsNetwork(mutinynetJson, 'signet')).toBe(true)
    expect(descriptorChangesetContradictsNetwork(mutinynetJson, 'mutinynet')).toBe(false)
  })

  it('detects public Signet anchors under a Mutinynet tip', () => {
    const changeSetJson = bdkChangesetJson({
      blockHeights: [0, PUBLIC_SIGNET_ANCHOR_HEIGHT, MUTINYNET_TIP_HEIGHT],
      anchorHeights: [PUBLIC_SIGNET_ANCHOR_HEIGHT],
    })
    expect(descriptorChangesetContradictsNetwork(changeSetJson, 'mutinynet')).toBe(true)
  })

  it('contradicts both labels for mixed anchors', () => {
    const changeSetJson = bdkChangesetJson({
      blockHeights: [0, PUBLIC_SIGNET_ANCHOR_HEIGHT, MUTINYNET_ANCHOR_HEIGHT],
      anchorHeights: [PUBLIC_SIGNET_ANCHOR_HEIGHT, MUTINYNET_ANCHOR_HEIGHT],
    })
    expect(descriptorChangesetContradictsNetwork(changeSetJson, 'signet')).toBe(true)
    expect(descriptorChangesetContradictsNetwork(changeSetJson, 'mutinynet')).toBe(true)
  })

  it('does not contradict when the changeset cannot be read', () => {
    expect(descriptorChangesetContradictsNetwork('{}', 'signet')).toBe(false)
    expect(descriptorChangesetContradictsNetwork('{not json', 'mutinynet')).toBe(false)
  })
})
