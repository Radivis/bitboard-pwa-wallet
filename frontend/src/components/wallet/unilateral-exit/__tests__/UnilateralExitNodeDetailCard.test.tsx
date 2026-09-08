import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { UnilateralExitNodeDetailCard } from '@/components/wallet/unilateral-exit/UnilateralExitNodeDetailCard'
import { renderWithProviders } from '@/test-utils/test-providers'
import { vtxoExitChildId, vtxoExitOutpointKey } from '@/lib/wallet/lifecycle/unilateral-exit/vtxo-exit-machine-types'
import type { ArkadeUnilateralExitTopology } from '@/workers/arkade-api'

const leafTxid = 'cc'

const topology: ArkadeUnilateralExitTopology = {
  nodes: [
    { txid: 'aa', txType: 'commitment', spends: [] },
    { txid: 'bb', txType: 'tree', spends: ['aa'] },
    { txid: leafTxid, txType: 'ark', spends: ['bb'] },
  ],
  leafOutpoints: [{ txid: leafTxid, vout: 0 }],
  hostOutpoints: [{ txid: leafTxid, vout: 0, amountSats: 25_000, isUnrolled: false }],
  exitBranchTxids: ['bb', leafTxid],
  commitmentTxids: ['aa'],
}

describe('UnilateralExitNodeDetailCard', () => {
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
})
