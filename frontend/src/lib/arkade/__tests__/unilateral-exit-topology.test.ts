import { describe, expect, it } from 'vitest'
import {
  computeExitPathTxids,
  layoutUnilateralExitGraph,
  leafOutpointNodeId,
  mergeNodeStatuses,
  resolveLayoutDirection,
} from '@/lib/arkade/unilateral-exit-topology'
import type { ArkadeUnilateralExitTopology } from '@/workers/arkade-api'

const sampleTopology: ArkadeUnilateralExitTopology = {
  nodes: [
    { txid: 'aa', txType: 'commitment', spends: [] },
    { txid: 'bb', txType: 'tree', spends: ['aa'] },
    { txid: 'cc', txType: 'ark', spends: ['bb'] },
  ],
  leafOutpoints: [{ txid: 'cc', vout: 0 }],
  exitBranchTxids: ['bb', 'cc'],
  commitmentTxids: ['aa'],
}

describe('unilateral-exit-topology helpers', () => {
  it('computeExitPathTxids walks spends from selected leaves', () => {
    const path = computeExitPathTxids(sampleTopology, [{ txid: 'cc', vout: 0 }])
    expect([...path]).toEqual(['cc', 'bb', 'aa'])
  })

  it('mergeNodeStatuses fills missing nodes as pending', () => {
    const merged = mergeNodeStatuses(sampleTopology, [
      { txid: 'cc', confirmations: 2, status: 'confirmed' },
    ])
    expect(merged.get('bb')?.status).toBe('pending')
    expect(merged.get('cc')?.confirmations).toBe(2)
  })

  it('resolveLayoutDirection prefers LR when width exceeds height', () => {
    expect(resolveLayoutDirection(800, 400)).toBe('LR')
    expect(resolveLayoutDirection(400, 800)).toBe('TB')
  })

  it('layoutUnilateralExitGraph renders one node per leaf outpoint on the same tx', () => {
    const topology: ArkadeUnilateralExitTopology = {
      ...sampleTopology,
      leafOutpoints: [
        { txid: 'cc', vout: 0 },
        { txid: 'cc', vout: 1 },
      ],
    }
    const { nodes, edges } = layoutUnilateralExitGraph({
      topology,
      selectedLeafOutpoints: [],
      nodeStatuses: [],
      layoutDirection: 'TB',
    })

    expect(nodes.filter((node) => node.data.isLeaf)).toHaveLength(2)
    expect(nodes.map((node) => node.id).sort()).toEqual(
      ['aa', 'bb', leafOutpointNodeId({ txid: 'cc', vout: 0 }), leafOutpointNodeId({ txid: 'cc', vout: 1 })].sort(),
    )
    expect(edges.filter((edge) => edge.target.startsWith('cc:'))).toHaveLength(2)
  })
})
