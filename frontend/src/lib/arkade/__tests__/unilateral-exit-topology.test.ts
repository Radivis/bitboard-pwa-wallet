import { describe, expect, it } from 'vitest'
import {
  computeExitPathTxids,
  layoutUnilateralExitGraph,
  leafOutpointsForTxid,
  mergeNodeStatuses,
  resolveLayoutDirection,
  resolveUnilateralExitTopologyOutpoints,
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

  it('leafOutpointsForTxid returns sorted sibling outpoints', () => {
    const topology: ArkadeUnilateralExitTopology = {
      ...sampleTopology,
      leafOutpoints: [
        { txid: 'cc', vout: 1 },
        { txid: 'cc', vout: 0 },
      ],
    }
    expect(leafOutpointsForTxid(topology, 'cc')).toEqual([
      { txid: 'cc', vout: 0 },
      { txid: 'cc', vout: 1 },
    ])
  })

  it('layoutUnilateralExitGraph renders spends edge paths between parent and child nodes', () => {
    const { nodes, edgePaths } = layoutUnilateralExitGraph({
      topology: sampleTopology,
      selectedLeafOutpoints: [],
      nodeStatuses: [],
      layoutDirection: 'TB',
    })

    expect(nodes).toHaveLength(3)
    expect(nodes.find((node) => node.id === 'cc')?.data.exitableVtxoCount).toBe(1)
    expect(nodes.find((node) => node.id === 'aa')?.data.exitableVtxoCount).toBe(0)
    expect(nodes.find((node) => node.id === 'bb')?.data.exitableVtxoCount).toBe(0)
    expect(edgePaths).toHaveLength(2)
    expect(edgePaths.map((edgePath) => edgePath.id).sort()).toEqual(['aa->bb', 'bb->cc'])
    expect(edgePaths.every((edgePath) => edgePath.path.startsWith('M'))).toBe(true)
    expect(nodes.every((node) => node.sourcePosition != null && node.targetPosition != null)).toBe(
      true,
    )
  })

  it('layoutUnilateralExitGraph falls back to exitBranchTxids when spends are empty', () => {
    const topology: ArkadeUnilateralExitTopology = {
      ...sampleTopology,
      nodes: sampleTopology.nodes.map((node) => ({ ...node, spends: [] })),
    }
    const { edgePaths } = layoutUnilateralExitGraph({
      topology,
      selectedLeafOutpoints: [],
      nodeStatuses: [],
      layoutDirection: 'TB',
    })

    expect(edgePaths.map((edgePath) => edgePath.id)).toEqual(['bb->cc'])
  })

  it('layoutUnilateralExitGraph renders one node per leaf virtual tx', () => {
    const topology: ArkadeUnilateralExitTopology = {
      ...sampleTopology,
      leafOutpoints: [
        { txid: 'cc', vout: 0 },
        { txid: 'cc', vout: 1 },
      ],
    }
    const { nodes, edgePaths } = layoutUnilateralExitGraph({
      topology,
      selectedLeafOutpoints: [{ txid: 'cc', vout: 0 }, { txid: 'cc', vout: 1 }],
      nodeStatuses: [],
      layoutDirection: 'TB',
    })

    expect(nodes.filter((node) => node.data.isLeaf)).toHaveLength(1)
    expect(nodes.find((node) => node.id === 'cc')?.data.exitableVtxoCount).toBe(2)
    expect(nodes.map((node) => node.id).sort()).toEqual(['aa', 'bb', 'cc'])
    expect(nodes.find((node) => node.id === 'cc')?.data.isSelectedLeaf).toBe(true)
    expect(edgePaths.filter((edgePath) => edgePath.id === 'bb->cc')).toHaveLength(1)
  })

  it('layoutUnilateralExitGraph marks only terminal branch leaves', () => {
    const topology: ArkadeUnilateralExitTopology = {
      nodes: [
        { txid: 'aa', txType: 'commitment', spends: [] },
        { txid: 'bb', txType: 'tree', spends: ['aa'] },
        { txid: 'mid', txType: 'ark', spends: ['bb'] },
        { txid: 'cp', txType: 'checkpoint', spends: ['mid'] },
        { txid: 'leaf', txType: 'ark', spends: ['cp'] },
      ],
      leafOutpoints: [
        { txid: 'leaf', vout: 0 },
        { txid: 'leaf', vout: 1 },
      ],
      exitBranchTxids: ['bb', 'mid', 'cp', 'leaf'],
      commitmentTxids: ['aa'],
    }

    const { nodes } = layoutUnilateralExitGraph({
      topology,
      selectedLeafOutpoints: [],
      nodeStatuses: [],
      layoutDirection: 'TB',
    })

    expect(nodes.filter((node) => node.data.isLeaf)).toHaveLength(1)
    expect(nodes.find((node) => node.id === 'mid')?.data.isLeaf).toBe(false)
    expect(nodes.find((node) => node.id === 'leaf')?.data.isLeaf).toBe(true)
  })

  it('resolveUnilateralExitTopologyOutpoints prefers selection, then in-progress, then job', () => {
    const selected = [{ txid: 'aa'.repeat(32), vout: 0 }]
    const inProgress = [{ txid: 'bb'.repeat(32), vout: 1 }]
    const persisted = [{ txid: 'cc'.repeat(32), vout: 2 }]

    expect(
      resolveUnilateralExitTopologyOutpoints({
        selectedLeafOutpoints: selected,
        inProgressOutpoints: inProgress,
        persistedJobOutpoints: persisted,
      }),
    ).toEqual(selected)

    expect(
      resolveUnilateralExitTopologyOutpoints({
        selectedLeafOutpoints: [],
        inProgressOutpoints: inProgress,
        persistedJobOutpoints: persisted,
      }),
    ).toEqual(inProgress)

    expect(
      resolveUnilateralExitTopologyOutpoints({
        selectedLeafOutpoints: [],
        inProgressOutpoints: [],
        persistedJobOutpoints: persisted,
      }),
    ).toEqual([])

    expect(
      resolveUnilateralExitTopologyOutpoints({
        selectedLeafOutpoints: [],
        inProgressOutpoints: [],
        persistedJobOutpoints: persisted,
        persistedJobStarted: true,
      }),
    ).toEqual(persisted)

    expect(
      resolveUnilateralExitTopologyOutpoints({
        selectedLeafOutpoints: [],
        inProgressOutpoints: [],
      }),
    ).toEqual([])
  })
})
