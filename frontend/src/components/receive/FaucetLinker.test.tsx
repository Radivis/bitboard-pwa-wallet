import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FaucetLinker } from '@/components/receive/FaucetLinker'
import { renderWithProviders } from '@/test-utils/test-providers'

const walletState = {
  networkMode: 'testnet' as const,
  loadedSubWallet: null as { networkMode: 'testnet' } | null,
}

vi.mock('@/stores/walletStore', () => ({
  selectCommittedNetworkMode: (s: typeof walletState) =>
    s.loadedSubWallet?.networkMode ?? s.networkMode,
  useWalletStore: (selector: (s: typeof walletState) => unknown) =>
    selector(walletState),
}))

vi.mock('@/lib/wallet-utils', () => ({
  loadCustomEsploraUrl: vi.fn().mockResolvedValue(null),
}))

describe('FaucetLinker', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    walletState.networkMode = 'testnet'
    walletState.loadedSubWallet = null
    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows ONLINE when fetch returns 2xx', async () => {
    renderWithProviders(<FaucetLinker />)

    await waitFor(() => {
      expect(screen.getAllByText('(ONLINE)').length).toBeGreaterThan(0)
    })
    expect(fetchMock).toHaveBeenCalled()
  })

  it('shows OFFLINE when fetch returns non-ok status', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 })
    renderWithProviders(<FaucetLinker />)

    await waitFor(() => {
      expect(screen.getAllByText('(OFFLINE)').length).toBeGreaterThan(0)
    })
  })

  it('shows UNKNOWN when fetch rejects', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    renderWithProviders(<FaucetLinker />)

    await waitFor(() => {
      expect(screen.getAllByText('(UNKNOWN)').length).toBeGreaterThan(0)
    })
  })

  it('runs reachability again when Recheck is clicked', async () => {
    const user = userEvent.setup()
    renderWithProviders(<FaucetLinker />)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled()
    })
    const firstCalls = fetchMock.mock.calls.length

    await user.click(
      screen.getByRole('button', { name: /Recheck whether each faucet responds/i }),
    )

    await waitFor(() => {
      expect(fetchMock.mock.calls.length).toBeGreaterThan(firstCalls)
    })
  })

  it('renders nothing when not on testnet or signet', () => {
    walletState.networkMode = 'mainnet'
    const { container } = renderWithProviders(<FaucetLinker />)
    expect(container.firstChild).toBeNull()
  })
})
