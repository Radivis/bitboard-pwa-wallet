import { describe, expect, it } from 'vitest'
import {
  barkExitPathTxids,
  layoutBarkExitGraph,
} from '@/lib/bark/bark-exit-graph-layout'
import {
  barkExitTopologyVtxoIds,
  readBarkExitGraph,
} from '@/lib/bark/bark-emergency-exit'
import type { BarkExitGraphNode } from '@/workers/bark-api'

const parentNode: BarkExitGraphNode = {
  txid: 'parent-txid',
  spends: [],
  leafVtxoIds: [],
  status: 'pending',
  needsChild: false,
  waitingOnTxids: [],
  txType: 'tree',
}

const leafNode: BarkExitGraphNode = {
  txid: 'leaf-txid',
  spends: ['parent-txid'],
  leafVtxoIds: ['vtxo-1'],
  status: 'inProgress',
  needsChild: true,
  waitingOnTxids: [],
  txType: 'tree',
}

describe('readBarkExitGraph', () => {
  it('reads needsChild and waitingOnTxids', () => {
    const graph = readBarkExitGraph({
      nodes: [
        {
          ...parentNode,
          waitingOnTxids: ['round-txid'],
        },
        leafNode,
      ],
    })

    expect(graph.nodes[0]?.waitingOnTxids).toEqual(['round-txid'])
    expect(graph.nodes[1]?.needsChild).toBe(true)
    expect(graph.nodes[1]?.status).toBe('inProgress')
    expect(graph.nodes[0]?.txType).toBe('tree')
    expect(graph.nodes[1]?.txType).toBe('tree')
  })

  it('reads a checkpoint transaction type', () => {
    const graph = readBarkExitGraph({
      nodes: [{ ...parentNode, txType: 'checkpoint' }],
    })

    expect(graph.nodes[0]?.txType).toBe('checkpoint')
  })

  it('reads a commitment transaction type', () => {
    const graph = readBarkExitGraph({
      nodes: [{ ...parentNode, txType: 'commitment' }],
    })

    expect(graph.nodes[0]?.txType).toBe('commitment')
  })

  it('rejects an unknown transaction type', () => {
    expect(() =>
      readBarkExitGraph({
        nodes: [{ ...parentNode, txType: 'ark' }],
      }),
    ).toThrow(/unknown transaction type/)
  })

  it('rejects an unknown status', () => {
    expect(() =>
      readBarkExitGraph({
        nodes: [{ ...parentNode, status: 'broadcast' }],
      }),
    ).toThrow(/unknown status/)
  })
})

describe('barkExitTopologyVtxoIds', () => {
  it('unions the selection with live exits and keeps live exits after the selection is cleared', () => {
    expect(
      barkExitTopologyVtxoIds({
        wholeWallet: false,
        selectedIds: ['vtxo-1'],
        spendableIds: ['vtxo-1', 'vtxo-2'],
        liveExitIds: [],
      }),
    ).toEqual(['vtxo-1'])

    expect(
      barkExitTopologyVtxoIds({
        wholeWallet: true,
        selectedIds: [],
        spendableIds: ['vtxo-2', 'vtxo-1'],
        liveExitIds: ['vtxo-3'],
      }),
    ).toEqual(['vtxo-1', 'vtxo-2', 'vtxo-3'])

    expect(
      barkExitTopologyVtxoIds({
        wholeWallet: false,
        selectedIds: [],
        spendableIds: ['vtxo-1'],
        liveExitIds: ['vtxo-1'],
      }),
    ).toEqual(['vtxo-1'])
  })
})

describe('layoutBarkExitGraph', () => {
  it('links a child to its parent and omits an outside spend', () => {
    const { nodes, edgePaths } = layoutBarkExitGraph({
      nodes: [parentNode, leafNode],
      layoutDirection: 'TB',
    })

    expect(nodes.map((node) => node.id).sort()).toEqual(['leaf-txid', 'parent-txid'])
    expect(edgePaths.map((edgePath) => edgePath.id)).toEqual(['parent-txid->leaf-txid'])
    expect(nodes.find((node) => node.id === 'parent-txid')?.data.isOnExitPath).toBe(true)
    expect(nodes.find((node) => node.id === 'leaf-txid')?.data.isOnExitPath).toBe(true)
    expect(edgePaths[0]?.animated).toBe(true)
  })

  it('draws one parent when two leaves share it and highlights that parent for either leaf', () => {
    const secondLeaf: BarkExitGraphNode = {
      txid: 'leaf-b',
      spends: ['parent-txid'],
      leafVtxoIds: ['vtxo-2'],
      status: 'pending',
      needsChild: false,
      waitingOnTxids: [],
      txType: 'tree',
    }
    const graphNodes = [parentNode, leafNode, secondLeaf]
    const { nodes, edgePaths } = layoutBarkExitGraph({
      nodes: graphNodes,
      layoutDirection: 'TB',
    })

    expect(nodes.filter((node) => node.id === 'parent-txid')).toHaveLength(1)
    expect(edgePaths.map((edgePath) => edgePath.id).sort()).toEqual([
      'parent-txid->leaf-b',
      'parent-txid->leaf-txid',
    ])
    expect(barkExitPathTxids([parentNode, secondLeaf]).has('parent-txid')).toBe(true)
    expect(nodes.find((node) => node.id === 'parent-txid')?.data.isOnExitPath).toBe(true)
  })
})
