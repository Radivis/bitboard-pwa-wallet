import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { BarkEmergencyExitPage } from '@/pages/wallet/BarkEmergencyExitPage'
import { renderWithProviders } from '@/test-utils/test-providers'
import type { NetworkMode } from '@/stores/walletStore'
import type { BarkEmergencyExitRow, BarkVtxoRow } from '@/workers/bark-api'

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
}))

const syncSnapshot = vi.hoisted(() => ({
  syncPhase: 'not-syncing' as const,
  lastSuccessfulSyncAt: null as string | null,
  spendableSats: 20_000 as number | null,
}))

const barkWorker = vi.hoisted(() => ({
  listVtxos: vi.fn(),
  listEmergencyExits: vi.fn(),
  estimateEmergencyExit: vi.fn(),
  startEmergencyExit: vi.fn(),
  progressEmergencyExits: vi.fn(),
  provideEmergencyExitCpfp: vi.fn(),
  cancelEmergencyExit: vi.fn(),
  drainEmergencyExits: vi.fn(),
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
    barkWorker.listVtxos.mockResolvedValue([spendableVtxo])
    barkWorker.listEmergencyExits.mockResolvedValue([])
    barkWorker.estimateEmergencyExit.mockResolvedValue({
      exitBroadcastFeeSats: 1_500,
      claimFeeSats: 800,
      feeRateSatPerVb: 1.5,
      txsToBroadcast: 4,
    })
    barkWorker.startEmergencyExit.mockResolvedValue(undefined)
    barkWorker.progressEmergencyExits.mockResolvedValue({ requests: [] })
    barkWorker.cancelEmergencyExit.mockResolvedValue(undefined)
    barkWorker.drainEmergencyExits.mockResolvedValue({ psbtHex: 'psbt', rawTxHex: 'raw' })
    cryptoWorker.broadcastTransaction.mockResolvedValue('claim-txid')
    barkWorker.startEmergencyExit.mockClear()
    barkWorker.offboardAll.mockClear()
    barkWorker.sendOnchain.mockClear()
    barkWorker.estimateEmergencyExit.mockClear()
    cryptoWorker.getNewAddress.mockClear()
    vi.mocked(toast.success).mockReset()
    vi.mocked(toast.error).mockReset()
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

  it('shows the establishing session state while Bark is loading', () => {
    loadSnapshot.loadPhase = 'loading'
    renderWithProviders(<BarkEmergencyExitPage />)
    expect(screen.getByTestId('bark-emergency-exit-session-loading')).toHaveTextContent(
      'Establishing Bark session…',
    )
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
})
