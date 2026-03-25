import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
vi.mock('@/stores/walletStore', () => ({
  useWalletStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector(walletStoreState),
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
      addressType: 'taproot',
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
