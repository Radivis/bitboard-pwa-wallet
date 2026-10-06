import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { BarkEmergencyExitPage } from '@/pages/wallet/BarkEmergencyExitPage'
import { renderWithProviders } from '@/test-utils/test-providers'
import type { NetworkMode } from '@/stores/walletStore'
import type { BarkEmergencyExitRow, BarkExitGraph, BarkVtxoRow } from '@/workers/bark-api'

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverStub

const walletStoreState = vi.hoisted(() => ({
  networkMode: 'signet' as NetworkMode,
  activeWalletId: 1 as number | null,
  currentAddress: 'tb1qcurrent' as string | null,
  addressType: 'taproot',
  accountId: 0,
  balance: { confirmedSats: 50_000, trustedPendingSats: 0, untrustedPendingSats: 0, immatureSats: 0 },
  loadedDescriptorWallet: { networkMode: 'signet' as NetworkMode },
}))

const featureState = vi.hoisted(() => ({
  isBarkEnabled: true,
}))

const loadSnapshot = vi.hoisted(() => ({
  loadPhase: 'loaded' as 'loaded' | 'loading' | 'load-error' | 'not-configured',
  networkMode: 'signet' as NetworkMode,
  errorMessage: null as string | null,
}))

const syncSnapshot = vi.hoisted(() => ({
  syncPhase: 'not-syncing' as const,
  lastSuccessfulSyncAt: null as string | null,
  spendableSats: 20_000 as number | null,
}))

const barkWorker = vi.hoisted(() => ({
  listVtxos: vi.fn(),
  listEmergencyExits: vi.fn(),
  exitTopology: vi.fn(),
  estimateEmergencyExit: vi.fn(),
  startEmergencyExit: vi.fn(),
  progressEmergencyExits: vi.fn(),
  provideEmergencyExitCpfp: vi.fn(),
  cancelEmergencyExit: vi.fn(),
  drainEmergencyExits: vi.fn(),
  readPendingEmergencyClaim: vi.fn(),
  writePendingEmergencyClaim: vi.fn(),
  readProceedAutomatically: vi.fn(),
  writeProceedAutomatically: vi.fn(),
  syncEmergencyExits: vi.fn(),
  broadcastEmergencyExitClaim: vi.fn(),
  offboardAll: vi.fn(),
  sendOnchain: vi.fn(),
}))

const cryptoWorker = vi.hoisted(() => ({
  signP2aCpfpChild: vi.fn(),
  applyUnconfirmedFundingTx: vi.fn(),
  broadcastTransaction: vi.fn(),
  getNewAddress: vi.fn(),
}))

const spendableVtxo: BarkVtxoRow = {
  id: 'vtxo-1',
  amountSats: 25_000,
  expiryHeight: 100,
  state: 'spendable',
  lockHolder: null,
  registered: true,
}

const syncAutomation = vi.hoisted(() => vi.fn(async () => undefined))
const stopAutomation = vi.hoisted(() => vi.fn())

const idleAutomationActivity = vi.hoisted(() => ({
  inFlight: false,
  errorMessage: null as string | null,
}))

vi.mock('@/lib/bark/bark-emergency-exit-automation', () => ({
  syncBarkEmergencyExitAutomation: (...args: unknown[]) => syncAutomation(...args),
  stopBarkEmergencyExitAutomation: (...args: unknown[]) => stopAutomation(...args),
  getBarkEmergencyExitAutomationActivity: () => idleAutomationActivity,
  subscribeBarkEmergencyExitAutomationActivity: () => () => undefined,
}))

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
  }
})

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

vi.mock('@/stores/featureStore', () => ({
  useFeatureStore: Object.assign(
    (selector: (state: typeof featureState) => unknown) => selector(featureState),
    { getState: () => featureState },
  ),
}))

vi.mock('@/stores/walletStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/walletStore')>()
  return {
    ...actual,
    useWalletStore: Object.assign(
      (selector: (state: typeof walletStoreState) => unknown) => selector(walletStoreState),
      { getState: () => walletStoreState },
    ),
  }
})

vi.mock('@/hooks/useBarkLoadLifecycleSnapshot', () => ({
  useBarkLoadLifecycleSnapshot: () => loadSnapshot,
}))

vi.mock('@/hooks/useBarkSyncLifecycleSnapshot', () => ({
  useBarkSyncLifecycleSnapshot: () => syncSnapshot,
}))

vi.mock('@/hooks/useEsploraFeePresets', () => ({
  useEsploraFeePresets: () => ({ data: { Low: 0.5, Medium: 2, High: 1 } }),
}))

vi.mock('@/workers/bark-factory', () => ({
  getBarkWorker: () => barkWorker,
}))

vi.mock('@/workers/crypto-factory', () => ({
  getCryptoWorker: () => cryptoWorker,
}))

vi.mock('@/lib/wallet/lifecycle/bark-sync-lifecycle-orchestrator', () => ({
  orchestrateBarkSync: vi.fn(async () => undefined),
}))

vi.mock('@/lib/wallet/lifecycle/onchain-sync-lifecycle-orchestrator', () => ({
  orchestrateOnchainSyncThenSave: vi.fn(async () => undefined),
}))

function exitRow(partial: Partial<BarkEmergencyExitRow> & Pick<BarkEmergencyExitRow, 'vtxoId'>): BarkEmergencyExitRow {
  return {
    state: 'processing',
    cancelable: false,
    ...partial,
  }
}

describe('BarkEmergencyExitPage', () => {
  beforeEach(() => {
    featureState.isBarkEnabled = true
    walletStoreState.networkMode = 'signet'
    walletStoreState.loadedDescriptorWallet = { networkMode: 'signet' }
    walletStoreState.currentAddress = 'tb1qcurrent'
    walletStoreState.balance.confirmedSats = 50_000
    loadSnapshot.loadPhase = 'loaded'
    loadSnapshot.errorMessage = null
    barkWorker.listVtxos.mockResolvedValue({ tipHeight: 90, rows: [spendableVtxo] })
    barkWorker.listEmergencyExits.mockResolvedValue([])
    barkWorker.exitTopology.mockResolvedValue({ nodes: [] })
    barkWorker.estimateEmergencyExit.mockResolvedValue({
      exitBroadcastFeeSats: 1_500,
      claimFeeSats: 800,
      feeRateSatPerVb: 1.5,
      txsToBroadcast: 4,
    })
    barkWorker.startEmergencyExit.mockResolvedValue(undefined)
    barkWorker.progressEmergencyExits.mockResolvedValue({ requests: [] })
    barkWorker.cancelEmergencyExit.mockResolvedValue(undefined)
    barkWorker.drainEmergencyExits.mockResolvedValue({
      psbtHex: 'psbt',
      rawTxHex: 'raw',
      vtxoIds: ['vtxo-1'],
    })
    barkWorker.readPendingEmergencyClaim.mockResolvedValue(null)
    barkWorker.writePendingEmergencyClaim.mockResolvedValue(undefined)
    barkWorker.readProceedAutomatically.mockResolvedValue(false)
    barkWorker.writeProceedAutomatically.mockResolvedValue(undefined)
    barkWorker.syncEmergencyExits.mockResolvedValue([])
    barkWorker.broadcastEmergencyExitClaim.mockResolvedValue(undefined)
    barkWorker.writePendingEmergencyClaim.mockResolvedValue(undefined)
    cryptoWorker.broadcastTransaction.mockResolvedValue('claim-txid')
    barkWorker.startEmergencyExit.mockClear()
    barkWorker.progressEmergencyExits.mockClear()
    barkWorker.cancelEmergencyExit.mockClear()
    barkWorker.drainEmergencyExits.mockClear()
    barkWorker.exitTopology.mockClear()
    barkWorker.offboardAll.mockClear()
    barkWorker.sendOnchain.mockClear()
    barkWorker.estimateEmergencyExit.mockClear()
    barkWorker.writeProceedAutomatically.mockClear()
    syncAutomation.mockClear()
    stopAutomation.mockClear()
    cryptoWorker.getNewAddress.mockClear()
    vi.mocked(toast.success).mockReset()
    vi.mocked(toast.error).mockReset()
  })

  it('keeps proceed automatically off until the switch is turned on', async () => {
    const user = userEvent.setup()
    renderWithProviders(<BarkEmergencyExitPage />)

    expect(
      await screen.findByText(
        'Automatic proceeding requires the app to stay unlocked and this wallet to stay on this network. This process cannot be delegated.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Proceed automatically advances an exit when a new block arrives/),
    ).toBeInTheDocument()

    const toggle = await screen.findByTestId('bark-emergency-exit-proceed-automatically')
    expect(toggle).toHaveAttribute('data-state', 'unchecked')
    await waitFor(() => {
      expect(toggle).toBeEnabled()
    })

    await user.click(toggle)

    await waitFor(() => {
      expect(barkWorker.writeProceedAutomatically).toHaveBeenCalledWith(true)
    })
    expect(syncAutomation).toHaveBeenCalledWith({ walletId: 1, networkMode: 'signet' })
    expect(stopAutomation).not.toHaveBeenCalled()
    expect(screen.getByTestId('bark-emergency-exit-progress')).toBeDisabled()
    expect(screen.getByTestId('bark-emergency-exit-automatic-status')).toHaveTextContent(
      'Waiting for the next block.',
    )
  })

  it('disables Progress while proceed automatically is already on', async () => {
    barkWorker.readProceedAutomatically.mockResolvedValue(true)
    renderWithProviders(<BarkEmergencyExitPage />)

    const progress = await screen.findByTestId('bark-emergency-exit-progress')
    await waitFor(() => {
      expect(progress).toBeDisabled()
    })
    expect(screen.getByTestId('bark-emergency-exit-automatic-status')).toBeInTheDocument()
  })

  it('BARK-EMG-02 is not the control surface unless Bark is enabled on signet', () => {
    featureState.isBarkEnabled = false
    const disabled = renderWithProviders(<BarkEmergencyExitPage />)
    expect(screen.getByTestId('bark-emergency-exit-unavailable')).toBeInTheDocument()
    expect(screen.queryByTestId('bark-emergency-exit-progress')).not.toBeInTheDocument()
    disabled.unmount()

    featureState.isBarkEnabled = true
    walletStoreState.networkMode = 'mutinynet'
    walletStoreState.loadedDescriptorWallet = { networkMode: 'mutinynet' }
    renderWithProviders(<BarkEmergencyExitPage />)
    expect(screen.getByTestId('bark-emergency-exit-unavailable')).toBeInTheDocument()
    expect(screen.queryByTestId('bark-emergency-exit-start')).not.toBeInTheDocument()
  })

  it('BARK-SESS-03 shows the Bark session loading screen while Bark is loading', () => {
    loadSnapshot.loadPhase = 'loading'
    renderWithProviders(<BarkEmergencyExitPage />)
    expect(screen.getByTestId('bark-session-loading')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Establishing Bark session' })).toBeInTheDocument()
    expect(screen.queryByTestId('bark-emergency-exit-start')).not.toBeInTheDocument()
  })

  it('BARK-SESS-04 shows the Bark session error screen when open fails', () => {
    loadSnapshot.loadPhase = 'load-error'
    loadSnapshot.errorMessage = 'signet unreachable'
    renderWithProviders(<BarkEmergencyExitPage />)
    expect(screen.getByTestId('bark-session-load-error')).toBeInTheDocument()
    expect(screen.getByText('signet unreachable')).toBeInTheDocument()
    expect(screen.queryByTestId('bark-emergency-exit-start')).not.toBeInTheDocument()
  })

  it('BARK-EMG-03 shows the broadcast fee, claim fee, and transaction count before start', async () => {
    renderWithProviders(<BarkEmergencyExitPage />)
    fireEvent.click(await screen.findByTestId('bark-emergency-exit-vtxo-vtxo-1'))
    fireEvent.click(screen.getByTestId('bark-emergency-exit-review'))
    expect(await screen.findByTestId('bark-emergency-exit-broadcast-fee')).toHaveTextContent('1500')
    expect(screen.getByTestId('bark-emergency-exit-claim-fee')).toHaveTextContent('800')
    expect(screen.getByTestId('bark-emergency-exit-tx-count')).toHaveTextContent('4')
    expect(barkWorker.estimateEmergencyExit).toHaveBeenCalledWith(['vtxo-1'], 1)
    expect(screen.getByTestId('bark-emergency-exit-fee-rate')).toHaveTextContent('1.50 sat/vB')
    expect(barkWorker.startEmergencyExit).not.toHaveBeenCalled()
  })

  it('BARK-EMG-04 starts the selected VTXOs or the whole wallet and does not offboard', async () => {
    renderWithProviders(<BarkEmergencyExitPage />)
    fireEvent.click(await screen.findByTestId('bark-emergency-exit-vtxo-vtxo-1'))
    fireEvent.click(screen.getByTestId('bark-emergency-exit-review'))
    fireEvent.click(await screen.findByTestId('bark-emergency-exit-start'))
    await waitFor(() => {
      expect(barkWorker.startEmergencyExit).toHaveBeenCalledWith(['vtxo-1'])
    })
    expect(barkWorker.offboardAll).not.toHaveBeenCalled()
    expect(barkWorker.sendOnchain).not.toHaveBeenCalled()

    fireEvent.click(screen.getByTestId('bark-emergency-exit-whole-wallet'))
    fireEvent.click(screen.getByTestId('bark-emergency-exit-review'))
    fireEvent.click(await screen.findByTestId('bark-emergency-exit-start'))
    await waitFor(() => {
      expect(barkWorker.startEmergencyExit).toHaveBeenLastCalledWith([])
    })
    expect(barkWorker.estimateEmergencyExit).toHaveBeenLastCalledWith([], 1)
    expect(barkWorker.offboardAll).not.toHaveBeenCalled()
    expect(barkWorker.sendOnchain).not.toHaveBeenCalled()
  })

  it('shows a started exit under Live exits', async () => {
    barkWorker.listEmergencyExits
      .mockResolvedValueOnce([])
      .mockResolvedValue([exitRow({ vtxoId: 'vtxo-1', state: 'start', cancelable: true })])
    renderWithProviders(<BarkEmergencyExitPage />)
    fireEvent.click(await screen.findByTestId('bark-emergency-exit-vtxo-vtxo-1'))
    fireEvent.click(screen.getByTestId('bark-emergency-exit-review'))
    fireEvent.click(await screen.findByTestId('bark-emergency-exit-start'))
    expect(await screen.findByTestId('bark-emergency-exit-row-vtxo-1')).toBeInTheDocument()
    expect(screen.getByTestId('bark-emergency-exit-row-vtxo-1')).toHaveTextContent('Started')
  })

  it('keeps start disabled when confirmed balance is below the broadcast fee', async () => {
    walletStoreState.balance.confirmedSats = 100
    renderWithProviders(<BarkEmergencyExitPage />)
    fireEvent.click(await screen.findByTestId('bark-emergency-exit-vtxo-vtxo-1'))
    fireEvent.click(screen.getByTestId('bark-emergency-exit-review'))
    expect(await screen.findByTestId('bark-emergency-exit-start')).toBeDisabled()
    expect(screen.getByTestId('bark-emergency-exit-start-blocked')).toBeInTheDocument()
    expect(barkWorker.startEmergencyExit).not.toHaveBeenCalled()
  })

  it('BARK-EMG-06 shows Cancel only while that exit is cancelable', async () => {
    barkWorker.listEmergencyExits.mockResolvedValue([
      exitRow({ vtxoId: 'open-exit', state: 'start', cancelable: true }),
      exitRow({ vtxoId: 'broadcast-exit', state: 'processing', cancelable: false }),
    ])
    renderWithProviders(<BarkEmergencyExitPage />)
    expect(await screen.findByTestId('bark-emergency-exit-cancel-open-exit')).toBeInTheDocument()
    expect(screen.queryByTestId('bark-emergency-exit-cancel-broadcast-exit')).not.toBeInTheDocument()
  })

  it('BARK-EMG-08 does not toast success when start, progress, or claim fails', async () => {
    barkWorker.listEmergencyExits.mockResolvedValue([
      exitRow({ vtxoId: 'claim-me', state: 'claimable', cancelable: false }),
    ])
    barkWorker.startEmergencyExit.mockRejectedValue(new Error('bark_exit_already_exited: gone'))
    renderWithProviders(<BarkEmergencyExitPage />)
    fireEvent.click(await screen.findByTestId('bark-emergency-exit-vtxo-vtxo-1'))
    fireEvent.click(screen.getByTestId('bark-emergency-exit-review'))
    fireEvent.click(await screen.findByTestId('bark-emergency-exit-start'))
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled()
    })
    expect(toast.success).not.toHaveBeenCalled()

    vi.mocked(toast.error).mockClear()
    barkWorker.progressEmergencyExits.mockRejectedValue(
      new Error('bark_cpfp_insufficient_funds: short'),
    )
    fireEvent.click(screen.getByTestId('bark-emergency-exit-progress'))
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled()
    })
    expect(toast.success).not.toHaveBeenCalled()

    vi.mocked(toast.error).mockClear()
    barkWorker.drainEmergencyExits.mockRejectedValue(new Error('bark_exit_not_claimable: none'))
    fireEvent.click(screen.getByTestId('bark-emergency-exit-claim'))
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled()
    })
    expect(toast.success).not.toHaveBeenCalled()
    expect(cryptoWorker.getNewAddress).not.toHaveBeenCalled()
  })

  it('BARK-EMG-15 does not toast success when start marks nothing', async () => {
    barkWorker.startEmergencyExit.mockRejectedValue(
      new Error('bark_exit_nothing_started: Bark did not mark any VTXO for exit'),
    )
    renderWithProviders(<BarkEmergencyExitPage />)
    fireEvent.click(await screen.findByTestId('bark-emergency-exit-vtxo-vtxo-1'))
    fireEvent.click(screen.getByTestId('bark-emergency-exit-review'))
    fireEvent.click(await screen.findByTestId('bark-emergency-exit-start'))
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled()
    })
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('does not offer a fresh claim for a VTXO Bark has not observed', async () => {
    barkWorker.listEmergencyExits.mockResolvedValue([
      exitRow({ vtxoId: 'held', state: 'claimable', cancelable: false }),
    ])
    barkWorker.readPendingEmergencyClaim.mockResolvedValue({
      txid: 'claim-txid',
      vtxoIds: ['held'],
    })
    renderWithProviders(<BarkEmergencyExitPage />)
    await waitFor(() => {
      expect(screen.getByTestId('bark-emergency-exit-row-held')).toHaveTextContent(
        'Claim in progress',
      )
    })
    expect(screen.getByTestId('bark-emergency-exit-claim')).toBeDisabled()
  })

  const exitTree: BarkExitGraph = {
    nodes: [
      {
        txid: 'anchor-txid',
        spends: [],
        leafVtxoIds: [],
        status: 'confirmed',
        needsChild: false,
        waitingOnTxids: [],
        txType: 'commitment',
      },
      {
        txid: 'parent-txid',
        spends: ['anchor-txid'],
        leafVtxoIds: [],
        status: 'pending',
        needsChild: false,
        waitingOnTxids: [],
        txType: 'tree',
      },
      {
        txid: 'checkpoint-txid',
        spends: ['parent-txid'],
        leafVtxoIds: [],
        status: 'pending',
        needsChild: false,
        waitingOnTxids: [],
        txType: 'checkpoint',
      },
      {
        txid: 'leaf-txid',
        spends: ['checkpoint-txid'],
        leafVtxoIds: ['vtxo-1'],
        status: 'inProgress',
        needsChild: true,
        waitingOnTxids: [],
        txType: 'tree',
      },
    ],
  }

  it('shows the empty exit tree until a VTXO or a live exit is chosen', async () => {
    renderWithProviders(<BarkEmergencyExitPage />)
    expect(await screen.findByTestId('bark-exit-tree-empty')).toHaveTextContent(
      'Select spendable VTXOs to see their exit tree.',
    )
    expect(barkWorker.exitTopology).not.toHaveBeenCalled()
  })

  it('BARK-EMG-10 draws the tree for the selection and keeps it after Start clears the checkboxes', async () => {
    barkWorker.exitTopology.mockResolvedValue(exitTree)
    renderWithProviders(<BarkEmergencyExitPage />)
    fireEvent.click(await screen.findByTestId('bark-emergency-exit-vtxo-vtxo-1'))
    expect(await screen.findByTestId('bark-exit-tree-graph')).toBeInTheDocument()
    await waitFor(() => {
      expect(barkWorker.exitTopology).toHaveBeenCalledWith(['vtxo-1'])
    })

    barkWorker.listEmergencyExits.mockResolvedValue([
      exitRow({ vtxoId: 'vtxo-1', state: 'start', cancelable: true }),
    ])
    fireEvent.click(screen.getByTestId('bark-emergency-exit-review'))
    fireEvent.click(await screen.findByTestId('bark-emergency-exit-start'))
    await waitFor(() => {
      expect(barkWorker.startEmergencyExit).toHaveBeenCalledWith(['vtxo-1'])
    })
    expect(screen.getByTestId('bark-emergency-exit-vtxo-vtxo-1')).not.toBeChecked()
    await waitFor(() => {
      expect(barkWorker.exitTopology).toHaveBeenLastCalledWith(['vtxo-1'])
    })
    expect(screen.getByTestId('bark-exit-tree-graph')).toBeInTheDocument()
  })

  it('shows a leaf icon and coin badge, a tree icon on the ancestor, and the unrolled coin when confirmed', async () => {
    barkWorker.exitTopology.mockResolvedValue({
      nodes: [
        ...exitTree.nodes,
        {
          txid: 'confirmed-leaf',
          spends: ['parent-txid'],
          leafVtxoIds: ['vtxo-1', 'vtxo-2'],
          status: 'confirmed',
          needsChild: false,
          waitingOnTxids: [],
          txType: 'tree',
        },
      ],
    })
    barkWorker.listEmergencyExits.mockResolvedValue([
      exitRow({ vtxoId: 'vtxo-1', state: 'processing', cancelable: false }),
    ])
    renderWithProviders(<BarkEmergencyExitPage />)
    const leaf = await screen.findByTestId('bark-exit-tree-node-leaf-txid')
    expect(leaf).toHaveAttribute('data-icon', 'leaf')
    expect(screen.getByTestId('bark-exit-tree-vtxo-count-leaf-txid')).toBeInTheDocument()
    expect(screen.queryByTestId('bark-exit-tree-unrolled-vtxo-count-leaf-txid')).not.toBeInTheDocument()

    const parent = screen.getByTestId('bark-exit-tree-node-parent-txid')
    expect(parent).toHaveAttribute('data-icon', 'tree')
    const anchor = screen.getByTestId('bark-exit-tree-node-anchor-txid')
    expect(anchor).toHaveAttribute('data-icon', 'commitment')
    fireEvent.click(anchor)
    expect(screen.getByTestId('bark-exit-tree-detail-status')).toHaveTextContent('Commitment')
    const checkpoint = screen.getByTestId('bark-exit-tree-node-checkpoint-txid')
    expect(checkpoint).toHaveAttribute('data-icon', 'checkpoint')
    fireEvent.click(checkpoint)
    expect(screen.getByTestId('bark-exit-tree-detail-status')).toHaveTextContent('Checkpoint')
    expect(screen.queryByTestId('bark-exit-tree-vtxo-count-parent-txid')).not.toBeInTheDocument()
    expect(screen.queryByTestId('bark-exit-tree-unrolled-vtxo-count-parent-txid')).not.toBeInTheDocument()

    const confirmed = screen.getByTestId('bark-exit-tree-node-confirmed-leaf')
    expect(confirmed).toHaveAttribute('data-icon', 'leaf')
    expect(screen.getByTestId('bark-exit-tree-unrolled-vtxo-count-confirmed-leaf')).toHaveTextContent(
      '2×',
    )
    expect(screen.queryByTestId('bark-exit-tree-vtxo-count-confirmed-leaf')).not.toBeInTheDocument()
  })

  it('BARK-EMG-12 shows the needs-child badge and not a child node', async () => {
    barkWorker.exitTopology.mockResolvedValue(exitTree)
    barkWorker.listEmergencyExits.mockResolvedValue([
      exitRow({ vtxoId: 'vtxo-1', state: 'processing', cancelable: true }),
    ])
    renderWithProviders(<BarkEmergencyExitPage />)
    expect(await screen.findByTestId('bark-exit-tree-needs-child-leaf-txid')).toBeInTheDocument()
    expect(screen.queryByTestId('bark-exit-tree-node-child-txid')).not.toBeInTheDocument()
  })

  it('BARK-EMG-13 shows the focused transaction id and the leaf VTXO id', async () => {
    barkWorker.exitTopology.mockResolvedValue(exitTree)
    barkWorker.listEmergencyExits.mockResolvedValue([
      exitRow({ vtxoId: 'vtxo-1', state: 'processing', cancelable: false }),
    ])
    renderWithProviders(<BarkEmergencyExitPage />)
    fireEvent.click(await screen.findByTestId('bark-exit-tree-node-leaf-txid'))
    expect(screen.getByTestId('bark-exit-tree-detail-txid')).toHaveTextContent('leaf-txid')
    expect(screen.getByTestId('bark-exit-tree-detail-vtxo-vtxo-1')).toHaveTextContent('vtxo-1')
  })

  it('BARK-EMG-14 does not start, progress, cancel, or claim when the tree renders', async () => {
    barkWorker.exitTopology.mockResolvedValue(exitTree)
    barkWorker.listEmergencyExits.mockResolvedValue([
      exitRow({ vtxoId: 'vtxo-1', state: 'processing', cancelable: true }),
    ])
    renderWithProviders(<BarkEmergencyExitPage />)
    expect(await screen.findByTestId('bark-exit-tree-graph')).toBeInTheDocument()
    expect(barkWorker.startEmergencyExit).not.toHaveBeenCalled()
    expect(barkWorker.progressEmergencyExits).not.toHaveBeenCalled()
    expect(barkWorker.cancelEmergencyExit).not.toHaveBeenCalled()
    expect(barkWorker.drainEmergencyExits).not.toHaveBeenCalled()
  })
})
