import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { UnilateralExitNodeDetailCard } from '@/components/wallet/unilateral-exit/UnilateralExitNodeDetailCard'
import { renderWithProviders } from '@/test-utils/test-providers'
import { vtxoExitChildId, vtxoExitOutpointKey } from '@/lib/wallet/lifecycle/unilateral-exit/vtxo-exit-machine-types'
import type { ArkadeUnilateralExitTopology } from '@/workers/arkade-api'

const leafTxid = 'cc'
const NOW_MS = Date.parse('2026-09-11T00:00:00.000Z')
const NOW_SECONDS = Math.floor(NOW_MS / 1000)
const DAY_SECONDS = 86_400

function topologyWithExpiresAt(expiresAt: number): ArkadeUnilateralExitTopology {
  return {
    nodes: [
      { txid: 'aa', txType: 'commitment', spends: [] },
      { txid: 'bb', txType: 'tree', spends: ['aa'] },
      { txid: leafTxid, txType: 'ark', spends: ['bb'] },
    ],
    leafOutpoints: [{ txid: leafTxid, vout: 0 }],
    hostOutpoints: [
      {
        txid: leafTxid,
        vout: 0,
        amountSats: 25_000,
        isUnrolled: false,
        expiresAt,
      },
    ],
    exitBranchTxids: ['bb', leafTxid],
    commitmentTxids: ['aa'],
  }
}

const topology = topologyWithExpiresAt(2_000_000_000)

describe('UnilateralExitNodeDetailCard', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('node_detail_reads_phase_from_children', () => {
    renderWithProviders(
      <UnilateralExitNodeDetailCard
        topology={topology}
        focusedNodeId={leafTxid}
        nodeStatuses={[{ txid: leafTxid, confirmations: 6, status: 'confirmed' }]}
        selectedLeafOutpoints={[]}
        onToggleLeafTxGroup={vi.fn()}
        vtxoExitSnapshots={{
          [vtxoExitOutpointKey(leafTxid, 0)]: {
            childId: vtxoExitChildId(leafTxid, 0),
            txid: leafTxid,
            vout: 0,
            phase: 'unrolled',
            machineState: 'unrolled',
          },
        }}
      />,
    )

    expect(screen.getByTestId('unilateral-exit-vtxo-phase')).toHaveTextContent(
      'waiting for timelock',
    )
    expect(screen.getByTestId('unilateral-exit-node-detail')).not.toHaveTextContent(
      /waiting for host transaction broadcast/i,
    )
    expect(screen.getByTestId('unilateral-exit-node-detail')).not.toHaveTextContent(
      /waiting for first confirmation/i,
    )
    expect(screen.getByTestId('unilateral-exit-node-detail')).not.toHaveTextContent(
      /waiting for 6 confirmations/i,
    )
  })

  it('node_detail_shows_expires_in_days', () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW_MS)

    renderWithProviders(
      <UnilateralExitNodeDetailCard
        topology={topologyWithExpiresAt(NOW_SECONDS + DAY_SECONDS * 5)}
        focusedNodeId={leafTxid}
        nodeStatuses={[{ txid: leafTxid, confirmations: 0, status: 'pending' }]}
        selectedLeafOutpoints={[]}
        onToggleLeafTxGroup={vi.fn()}
      />,
    )

    expect(screen.getByTestId('unilateral-exit-vtxo-expiry')).toHaveTextContent(
      'expires in 5 days',
    )
  })

  it('node_detail_shows_expired', () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW_MS)

    renderWithProviders(
      <UnilateralExitNodeDetailCard
        topology={topologyWithExpiresAt(NOW_SECONDS - 1)}
        focusedNodeId={leafTxid}
        nodeStatuses={[{ txid: leafTxid, confirmations: 0, status: 'pending' }]}
        selectedLeafOutpoints={[]}
        onToggleLeafTxGroup={vi.fn()}
      />,
    )

    expect(screen.getByTestId('unilateral-exit-vtxo-expiry')).toHaveTextContent('expired')
  })

  it('node_detail_omits_expiry_when_expires_at_missing', () => {
    renderWithProviders(
      <UnilateralExitNodeDetailCard
        topology={topologyWithExpiresAt(0)}
        focusedNodeId={leafTxid}
        nodeStatuses={[{ txid: leafTxid, confirmations: 0, status: 'pending' }]}
        selectedLeafOutpoints={[]}
        onToggleLeafTxGroup={vi.fn()}
      />,
    )

    expect(screen.queryByTestId('unilateral-exit-vtxo-expiry')).not.toBeInTheDocument()
  })
})
