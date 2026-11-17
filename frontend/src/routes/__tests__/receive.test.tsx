import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AddressType } from '@/lib/wallet/wallet-domain-types'
import { renderWithProviders } from '@/test-utils/test-providers'

const mockNavigate = vi.fn()
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    createFileRoute: (_path: string) => (options: Record<string, unknown>) => ({
      options,
    }),
    useNavigate: () => mockNavigate,
    useSearch: () => ({}),
  }
})

const mockGetNewAddress = vi.fn()
const mockGetExternalReceiveGap = vi.fn()
const mockExportChangeset = vi.fn()
vi.mock('@/stores/cryptoStore', () => ({
  useCryptoStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      getNewAddress: mockGetNewAddress,
      getExternalReceiveGap: mockGetExternalReceiveGap,
      exportChangeset: mockExportChangeset,
    }),
}))

const syncMetadataState: {
  data?: { isStaleOnchain: boolean; lastSuccessfulEsploraSyncAt?: string }
} = {}
vi.mock('@/hooks/useOnchainDashboardQueries', () => ({
  useOnchainEsploraSyncMetadataQuery: () => syncMetadataState,
}))

let walletStoreState: Record<string, unknown> = {}
const mockSetCurrentAddress = vi.fn()
vi.mock('@/stores/walletStore', async () => {
  const { AddressType } = await import('@/lib/wallet/wallet-domain-types')
  return {
    AddressType,
    useWalletStore: (selector: (s: Record<string, unknown>) => unknown) =>
      selector(walletStoreState),
    selectCommittedNetworkMode: (s: {
      loadedDescriptorWallet: { networkMode: string } | null
      networkMode: string
    }) => s.loadedDescriptorWallet?.networkMode ?? s.networkMode,
  }
})

const receiveFeatureState = {
  isLightningEnabled: false,
  isSegwitAddressesEnabled: true,
  isBarkEnabled: false,
}

vi.mock('@/stores/featureStore', () => ({
  useFeatureStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) => selector(receiveFeatureState),
    {
      getState: () => ({
        ...receiveFeatureState,
        isArkadeEnabled: false,
        isBarkEnabled: receiveFeatureState.isBarkEnabled,
        isMainnetAccessEnabled: true,
      }),
    },
  ),
}))

vi.mock('@/components/WalletUnlock', () => ({
  WalletUnlock: () => <div data-testid="wallet-unlock">Unlock</div>,
}))

vi.mock('@/lib/wallet/wallet-utils', () => ({
  updateWalletChangeset: vi.fn().mockResolvedValue(undefined),
  loadCustomEsploraUrl: vi.fn().mockResolvedValue(null),
}))

vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value }: { value: string }) => (
    <svg data-testid="qr-code" data-value={value} />
  ),
}))

import { ReceivePage } from '@/pages/wallet/ReceivePage'
import { LAB_WALLET_RECEIVE_PAGE_TITLE } from '@/lib/wallet/wallet-lab-ui-copy'
import {
  HARD_GAP_CONFIRM_TITLE,
  HARD_GAP_GENERATE_LABEL,
  HARD_GAP_OPT_IN_LABEL,
  SOFT_GAP_CONFIRM_TITLE,
  SOFT_GAP_GENERATE_LABEL,
  SOFT_GAP_KEEP_LABEL,
  paymentsToAddressLabel,
  unusedGapLabel,
} from '@/lib/wallet/receive-gap-surface'

describe('ReceivePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200 }),
    )
    receiveFeatureState.isSegwitAddressesEnabled = true
    receiveFeatureState.isBarkEnabled = false
    syncMetadataState.data = undefined
    mockGetExternalReceiveGap.mockResolvedValue({
      revealed: false,
      index: 0,
      receiveCount: 0,
      gap: 0,
    })
    walletStoreState = {
      activeWalletId: 1,
      walletStatus: 'unlocked',
      currentAddress: 'tb1qtest123address456',
      addressType: AddressType.Taproot,
      networkMode: 'testnet',
      loadedDescriptorWallet: null,
      setCurrentAddress: mockSetCurrentAddress,
    }
  })

  it('redirects to setup when no active wallet', () => {
    walletStoreState.activeWalletId = null
    renderWithProviders(<ReceivePage />)
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/setup' })
  })

  it('calls getNewAddress on mount when unlocked and no address', async () => {
    walletStoreState.currentAddress = null
    mockGetNewAddress.mockResolvedValue('tb1qnewaddress')
    renderWithProviders(<ReceivePage />)

    await waitFor(() => {
      expect(mockGetNewAddress).toHaveBeenCalled()
    })
  })

  it('shows Mainnet demo warning modal and dismisses with OK', async () => {
    const user = userEvent.setup()
    walletStoreState.networkMode = 'mainnet'
    renderWithProviders(<ReceivePage />)

    expect(
      await screen.findByRole('heading', { name: 'Demo mode (Mainnet)' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Bitcoin Codex is still in DEMO MODE/i),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'OK' }))

    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: 'Demo mode (Mainnet)' }),
      ).not.toBeInTheDocument()
    })
    expect(screen.getByRole('heading', { name: 'Receive Bitcoin' })).toBeInTheDocument()
  })

  it('does not show Mainnet demo warning when not on Mainnet', () => {
    walletStoreState.networkMode = 'testnet'
    renderWithProviders(<ReceivePage />)

    expect(
      screen.queryByRole('heading', { name: 'Demo mode (Mainnet)' }),
    ).not.toBeInTheDocument()
  })

  it('shows Receive Lab Bitcoin heading when network is lab', () => {
    walletStoreState.networkMode = 'lab'
    renderWithProviders(<ReceivePage />)
    expect(
      screen.getByRole('heading', { name: LAB_WALLET_RECEIVE_PAGE_TITLE }),
    ).toBeInTheDocument()
  })

  it('displays address text and QR code', () => {
    renderWithProviders(<ReceivePage />)

    expect(screen.getByText('tb1qtest123address456')).toBeInTheDocument()
    const qr = screen.getByTestId('qr-code')
    expect(qr).toHaveAttribute('data-value', 'bitcoin:tb1qtest123address456')
  })

  it('address type badge shows correct type when SegWit addresses feature is on', () => {
    receiveFeatureState.isSegwitAddressesEnabled = true
    renderWithProviders(<ReceivePage />)
    expect(screen.getByText('Taproot (BIP86)')).toBeInTheDocument()
  })

  it('hides address type badge when SegWit addresses feature is off', () => {
    receiveFeatureState.isSegwitAddressesEnabled = false
    renderWithProviders(<ReceivePage />)
    expect(screen.queryByText('Taproot (BIP86)')).not.toBeInTheDocument()
  })

  it('Copy button copies address to clipboard', async () => {
    const user = userEvent.setup()
    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    })

    renderWithProviders(<ReceivePage />)

    await user.click(screen.getByRole('button', { name: 'Copy address' }))
    expect(writeTextMock).toHaveBeenCalledWith('tb1qtest123address456')
  })

  function syncedGap(gap: number, receiveCount = 0) {
    syncMetadataState.data = {
      isStaleOnchain: false,
      lastSuccessfulEsploraSyncAt: '2026-01-15T10:30:00.000Z',
    }
    mockGetExternalReceiveGap.mockResolvedValue({
      revealed: true,
      index: gap,
      receiveCount,
      gap,
    })
  }

  it('hides the payment count before any public sync', () => {
    renderWithProviders(<ReceivePage />)
    expect(screen.queryByTestId('receive-payment-count')).not.toBeInTheDocument()
  })

  it('shows the payment count after a sync and the gap line from 2', async () => {
    syncedGap(1, 0)
    const { unmount } = renderWithProviders(<ReceivePage />)
    expect(await screen.findByTestId('receive-payment-count')).toHaveTextContent(
      paymentsToAddressLabel(0),
    )
    expect(
      screen.getByTestId('receive-payment-count').closest('[data-infomode-id="receive-payment-count"]'),
    ).not.toBeNull()
    expect(screen.queryByTestId('receive-unused-gap')).not.toBeInTheDocument()
    unmount()

    syncedGap(2, 3)
    renderWithProviders(<ReceivePage />)
    expect(await screen.findByTestId('receive-unused-gap')).toHaveTextContent(unusedGapLabel(2))
    expect(
      screen.getByTestId('receive-unused-gap').closest('[data-infomode-id="receive-unused-gap"]'),
    ).not.toBeNull()
    expect(screen.getByTestId('receive-payment-count')).toHaveTextContent(paymentsToAddressLabel(3))
  })

  it('asks before generating when the gap is at least 1 and skips the reveal on cancel', async () => {
    const user = userEvent.setup()
    syncedGap(1)
    renderWithProviders(<ReceivePage />)
    await screen.findByTestId('receive-payment-count')

    await user.click(screen.getByRole('button', { name: 'Generate New Address' }))
    expect(await screen.findByRole('heading', { name: SOFT_GAP_CONFIRM_TITLE })).toBeInTheDocument()
    expect(screen.getByText(/leaves 2 unused addresses in a row/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: SOFT_GAP_KEEP_LABEL }))

    expect(mockGetNewAddress).not.toHaveBeenCalled()
  })

  it('reveals after the soft confirmation', async () => {
    const user = userEvent.setup()
    syncedGap(1)
    mockGetNewAddress.mockResolvedValue('tb1qnewaddress789')
    mockExportChangeset.mockResolvedValue('{}')
    renderWithProviders(<ReceivePage />)
    await screen.findByTestId('receive-payment-count')

    await user.click(screen.getByRole('button', { name: 'Generate New Address' }))
    await user.click(await screen.findByRole('button', { name: SOFT_GAP_GENERATE_LABEL }))

    await waitFor(() => {
      expect(mockGetNewAddress).toHaveBeenCalled()
    })
  })

  it('keeps the hard warning confirm disabled until the opt-in is checked', async () => {
    const user = userEvent.setup()
    syncedGap(20)
    mockGetNewAddress.mockResolvedValue('tb1qpastgap')
    mockExportChangeset.mockResolvedValue('{}')
    renderWithProviders(<ReceivePage />)
    await screen.findByTestId('receive-payment-count')

    await user.click(screen.getByRole('button', { name: 'Generate New Address' }))
    const confirm = await screen.findByRole('button', { name: HARD_GAP_GENERATE_LABEL })
    expect(confirm).toBeDisabled()

    await user.click(screen.getByRole('checkbox', { name: HARD_GAP_OPT_IN_LABEL }))
    expect(confirm).toBeEnabled()
    await user.click(confirm)

    await waitFor(() => {
      expect(mockGetNewAddress).toHaveBeenCalled()
    })
  })

  it('reveals immediately when the synced gap is 0', async () => {
    const user = userEvent.setup()
    syncedGap(0, 1)
    mockGetNewAddress.mockResolvedValue('tb1qfresh')
    mockExportChangeset.mockResolvedValue('{}')
    renderWithProviders(<ReceivePage />)
    await screen.findByTestId('receive-payment-count')

    await user.click(screen.getByRole('button', { name: 'Generate New Address' }))

    await waitFor(() => {
      expect(mockGetNewAddress).toHaveBeenCalled()
    })
    expect(screen.queryByRole('heading', { name: SOFT_GAP_CONFIRM_TITLE })).not.toBeInTheDocument()
  })

  it('shows the saved-chain note when this session has not verified Esplora', async () => {
    syncMetadataState.data = {
      isStaleOnchain: true,
      lastSuccessfulEsploraSyncAt: '2026-01-15T10:30:00.000Z',
    }
    mockGetExternalReceiveGap.mockResolvedValue({
      revealed: true,
      index: 0,
      receiveCount: 1,
      gap: 0,
    })
    renderWithProviders(<ReceivePage />)

    expect(await screen.findByTestId('receive-gap-stale-banner')).toHaveTextContent(
      'Showing saved chain state',
    )
    expect(screen.getByTestId('receive-payment-count')).toHaveTextContent(paymentsToAddressLabel(1))
  })

  it('asks for the hard opt-in before a public sync when the local gap is already 20', async () => {
    const user = userEvent.setup()
    mockGetExternalReceiveGap.mockResolvedValue({
      revealed: true,
      index: 20,
      receiveCount: 0,
      gap: 20,
    })
    renderWithProviders(<ReceivePage />)

    expect(screen.queryByTestId('receive-payment-count')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Generate New Address' }))

    expect(await screen.findByRole('heading', { name: HARD_GAP_CONFIRM_TITLE })).toBeInTheDocument()
    expect(mockGetNewAddress).not.toHaveBeenCalled()
    expect(screen.queryByTestId('receive-payment-count')).not.toBeInTheDocument()
  })

  it('reveals immediately before a public sync when the local gap is under 20', async () => {
    const user = userEvent.setup()
    mockGetExternalReceiveGap.mockResolvedValue({
      revealed: true,
      index: 4,
      receiveCount: 0,
      gap: 4,
    })
    mockGetNewAddress.mockResolvedValue('tb1qnext')
    mockExportChangeset.mockResolvedValue('{}')
    renderWithProviders(<ReceivePage />)

    await user.click(screen.getByRole('button', { name: 'Generate New Address' }))

    await waitFor(() => {
      expect(mockGetNewAddress).toHaveBeenCalled()
    })
    expect(screen.queryByRole('heading', { name: SOFT_GAP_CONFIRM_TITLE })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: HARD_GAP_CONFIRM_TITLE })).not.toBeInTheDocument()
    expect(screen.queryByTestId('receive-payment-count')).not.toBeInTheDocument()
  })

  it('stays on the hard warning when a confirm re-read reaches gap 20', async () => {
    const user = userEvent.setup()
    syncMetadataState.data = {
      isStaleOnchain: false,
      lastSuccessfulEsploraSyncAt: '2026-01-15T10:30:00.000Z',
    }
    let gap = 19
    mockGetExternalReceiveGap.mockImplementation(async () => ({
      revealed: true,
      index: gap,
      receiveCount: 0,
      gap,
    }))
    renderWithProviders(<ReceivePage />)
    await screen.findByTestId('receive-payment-count')

    await user.click(screen.getByRole('button', { name: 'Generate New Address' }))
    expect(await screen.findByRole('heading', { name: SOFT_GAP_CONFIRM_TITLE })).toBeInTheDocument()
    gap = 20
    await user.click(screen.getByRole('button', { name: SOFT_GAP_GENERATE_LABEL }))

    expect(await screen.findByRole('heading', { name: HARD_GAP_CONFIRM_TITLE })).toBeInTheDocument()
    expect(mockGetNewAddress).not.toHaveBeenCalled()
  })

  it('reveals when a confirm re-read finds the gap has cleared', async () => {
    const user = userEvent.setup()
    syncMetadataState.data = {
      isStaleOnchain: false,
      lastSuccessfulEsploraSyncAt: '2026-01-15T10:30:00.000Z',
    }
    let gap = 20
    mockGetExternalReceiveGap.mockImplementation(async () => ({
      revealed: true,
      index: gap,
      receiveCount: gap === 0 ? 1 : 0,
      gap,
    }))
    mockGetNewAddress.mockResolvedValue('tb1qpaid')
    mockExportChangeset.mockResolvedValue('{}')
    renderWithProviders(<ReceivePage />)
    await screen.findByTestId('receive-payment-count')

    await user.click(screen.getByRole('button', { name: 'Generate New Address' }))
    await user.click(await screen.findByRole('checkbox', { name: HARD_GAP_OPT_IN_LABEL }))
    gap = 0
    await user.click(screen.getByRole('button', { name: HARD_GAP_GENERATE_LABEL }))

    await waitFor(() => {
      expect(mockGetNewAddress).toHaveBeenCalled()
    })
  })

  it('shows the Labnet payment count without an Esplora sync timestamp', async () => {
    walletStoreState.networkMode = 'lab'
    mockGetExternalReceiveGap.mockResolvedValue({
      revealed: true,
      index: 0,
      receiveCount: 4,
      gap: 0,
    })
    renderWithProviders(<ReceivePage />)

    expect(await screen.findByTestId('receive-payment-count')).toHaveTextContent(
      paymentsToAddressLabel(4),
    )
    expect(screen.queryByTestId('receive-gap-stale-banner')).not.toBeInTheDocument()
  })

  it('Generate New Address calls getNewAddress', async () => {
    const user = userEvent.setup()
    mockGetNewAddress.mockResolvedValue('tb1qnewaddress789')
    mockExportChangeset.mockResolvedValue('{}')
    renderWithProviders(<ReceivePage />)

    await user.click(screen.getByText('Generate New Address'))

    await waitFor(() => {
      expect(mockGetNewAddress).toHaveBeenCalled()
    })
  })

  it('shows a Bark segment on signet when the flag is on', () => {
    walletStoreState.networkMode = 'signet'
    receiveFeatureState.isBarkEnabled = true
    renderWithProviders(<ReceivePage />)
    expect(screen.getByRole('button', { name: 'Bark' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Receive Bitcoin' })).toBeInTheDocument()
    expect(screen.queryByText('Bark receiving address')).not.toBeInTheDocument()
  })
  it('hides Bark when the flag is off', () => {
    walletStoreState.networkMode = 'signet'
    receiveFeatureState.isBarkEnabled = false
    renderWithProviders(<ReceivePage />)
    expect(screen.queryByRole('button', { name: 'Bark' })).not.toBeInTheDocument()
  })

  it('hides Bark when the network is not signet', () => {
    walletStoreState.networkMode = 'testnet'
    receiveFeatureState.isBarkEnabled = true
    renderWithProviders(<ReceivePage />)
    expect(screen.queryByRole('button', { name: 'Bark' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Receive Bitcoin' })).toBeInTheDocument()
  })
})
