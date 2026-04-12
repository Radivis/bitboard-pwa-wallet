import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AddressType } from '@/lib/wallet-domain-types'
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
  }
})

const mockGetNewAddress = vi.fn()
const mockExportChangeset = vi.fn()
vi.mock('@/stores/cryptoStore', () => ({
  useCryptoStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      getNewAddress: mockGetNewAddress,
      exportChangeset: mockExportChangeset,
    }),
}))

let walletStoreState: Record<string, unknown> = {}
const mockSetCurrentAddress = vi.fn()
vi.mock('@/stores/walletStore', async () => {
  const { AddressType } = await import('@/lib/wallet-domain-types')
  return {
    AddressType,
    useWalletStore: (selector: (s: Record<string, unknown>) => unknown) =>
      selector(walletStoreState),
    selectCommittedNetworkMode: (s: {
      loadedSubWallet: { networkMode: string } | null
      networkMode: string
    }) => s.loadedSubWallet?.networkMode ?? s.networkMode,
  }
})

vi.mock('@/stores/featureStore', () => ({
  useFeatureStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ lightningEnabled: false }),
}))

vi.mock('@/stores/sessionStore', () => ({
  useSessionStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ password: 'testpass' }),
}))

vi.mock('@/components/WalletUnlock', () => ({
  WalletUnlock: () => <div data-testid="wallet-unlock">Unlock</div>,
}))

vi.mock('@/lib/wallet-utils', () => ({
  updateWalletChangeset: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value }: { value: string }) => (
    <svg data-testid="qr-code" data-value={value} />
  ),
}))

import { ReceivePage } from '../wallet/receive'

describe('ReceivePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    walletStoreState = {
      activeWalletId: 1,
      walletStatus: 'unlocked',
      currentAddress: 'tb1qtest123address456',
      addressType: AddressType.Taproot,
      networkMode: 'testnet',
      loadedSubWallet: null,
      setCurrentAddress: mockSetCurrentAddress,
    }
  })

  it('redirects to setup when no active wallet', () => {
    walletStoreState.activeWalletId = null
    renderWithProviders(<ReceivePage />)
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/setup' })
  })

  it('shows WalletUnlock when locked', () => {
    walletStoreState.walletStatus = 'locked'
    renderWithProviders(<ReceivePage />)
    expect(screen.getByTestId('wallet-unlock')).toBeInTheDocument()
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
      screen.getByText(/Bitboard Wallet is still in DEMO MODE/i),
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

  it('displays address text and QR code', () => {
    renderWithProviders(<ReceivePage />)

    expect(screen.getByText('tb1qtest123address456')).toBeInTheDocument()
    const qr = screen.getByTestId('qr-code')
    expect(qr).toHaveAttribute('data-value', 'bitcoin:tb1qtest123address456')
  })

  it('address type badge shows correct type', () => {
    renderWithProviders(<ReceivePage />)
    expect(screen.getByText('Taproot (BIP86)')).toBeInTheDocument()
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
})
