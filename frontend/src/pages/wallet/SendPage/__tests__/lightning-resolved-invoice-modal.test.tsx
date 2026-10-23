import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useSendFlowLightning } from '../lightning'
import type { ConnectedLightningWallet } from '@/lib/lightning/lightning-backend-service'

const mockLightningPayMutate = vi.fn()
vi.mock('@/hooks/useLightningMutations', () => ({
  useLightningPayMutation: () => ({
    mutate: mockLightningPayMutate,
    isPending: false,
  }),
}))

const sampleWallet: ConnectedLightningWallet = {
  id: 'conn-1',
  walletId: 1,
  label: 'NWC Wallet',
  networkMode: 'mutinynet',
  config: {
    connectionUri: 'nostr+walletconnect://...',
  },
}

vi.mock('@/hooks/useSendLightningBalances', () => ({
  useSendLightningBalances: () => ({
    matchingLightningConnections: [sampleWallet],
    selectedLightningConnectionId: 'conn-1',
    setSelectedLightningConnectionId: vi.fn(),
    balanceQueries: [],
    selectedLightningWallet: sampleWallet,
    selectedLnBalanceQuery: { isSuccess: true },
    selectedLnBalanceSats: 50000,
    hasLightningWalletSelected: true,
  }),
}))

const mockResolveLnurlPayInvoice = vi.fn()
vi.mock('@/lib/lightning/resolve-lnurl-pay-invoice', () => ({
  resolveLnurlPayInvoice: (...args: unknown[]) => mockResolveLnurlPayInvoice(...args),
}))

const mockRequestInvoice = vi.fn()
vi.mock('@getalby/lightning-tools/lnurl', () => {
  class MockLightningAddress {
    fetch = vi.fn().mockResolvedValue(undefined)
    requestInvoice = mockRequestInvoice
  }
  return {
    LightningAddress: MockLightningAddress,
  }
})

function TestHarness({
  networkMode = 'mutinynet',
  recipient = 'alice@mutiny.plus',
  amountSats = 1000,
}: {
  networkMode?: NetworkMode
  recipient?: string
  amountSats?: number
}) {
  const { submitLightningPayment, resolvedSignetFamilyInvoiceModal } =
    useSendFlowLightning({
      isLightningEnabled: true,
      networkMode,
      activeWalletId: 1,
      connectedLightningWallets: [sampleWallet],
      normalizedRecipient: recipient,
      amountSats,
    })

  return (
    <div>
      <button onClick={submitLightningPayment}>Pay with Lightning</button>
      {resolvedSignetFamilyInvoiceModal}
    </div>
  )
}

describe('useSendFlowLightning resolved invoice modal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('opens AppModal instead of window.confirm when resolved invoice is signet on mutinynet', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    mockRequestInvoice.mockResolvedValueOnce({
      paymentRequest: 'lntbs10u1presolvedsignetinvoicestring',
    })

    const user = userEvent.setup()
    render(<TestHarness networkMode="mutinynet" />)

    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Pay with Lightning' }))
    })

    expect(confirmSpy).not.toHaveBeenCalled()
    expect(screen.getByText('Confirm invoice network')).toBeInTheDocument()
    expect(
      screen.getByText(/Signet and Mutinynet invoices share a BOLT11 prefix/),
    ).toBeInTheDocument()
    expect(mockLightningPayMutate).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Confirm and pay' }))

    expect(mockLightningPayMutate).toHaveBeenCalledWith({
      bolt11: 'lntbs10u1presolvedsignetinvoicestring',
      config: sampleWallet.config,
    })
    expect(screen.queryByText('Confirm invoice network')).not.toBeInTheDocument()
  })

  it('does not pay and closes modal when user clicks Cancel', async () => {
    mockRequestInvoice.mockResolvedValueOnce({
      paymentRequest: 'lntbs10u1presolvedsignetinvoicestring',
    })

    const user = userEvent.setup()
    render(<TestHarness networkMode="mutinynet" />)

    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Pay with Lightning' }))
    })

    expect(screen.getByText('Confirm invoice network')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(mockLightningPayMutate).not.toHaveBeenCalled()
    expect(screen.queryByText('Confirm invoice network')).not.toBeInTheDocument()
  })

  it('prompts AppModal for LNURL-pay destination resolving to signet invoice on mutinynet', async () => {
    mockResolveLnurlPayInvoice.mockResolvedValueOnce({
      bolt11: 'lntbs10u1plnurlresolvedinvoice',
    })

    const user = userEvent.setup()
    render(
      <TestHarness
        networkMode="mutinynet"
        recipient="lnurl1dp68gurn8ghj7um9wfmxjcm99e3k7mf0v9cxj0m385ekvcenxc6r2c35xvukxefcv5mksv3jvg6rwetj89u"
      />,
    )

    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Pay with Lightning' }))
    })

    expect(screen.getByText('Confirm invoice network')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Confirm and pay' }))

    expect(mockLightningPayMutate).toHaveBeenCalledWith({
      bolt11: 'lntbs10u1plnurlresolvedinvoice',
      config: sampleWallet.config,
    })
  })

  it('pays immediately without opening modal when confirmation is not needed', async () => {
    mockRequestInvoice.mockResolvedValueOnce({
      paymentRequest: 'lnbc10u1pmainnetinvoice',
    })

    const user = userEvent.setup()
    render(<TestHarness networkMode="mainnet" />)

    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Pay with Lightning' }))
    })

    expect(screen.queryByText('Confirm invoice network')).not.toBeInTheDocument()
    expect(mockLightningPayMutate).toHaveBeenCalledWith({
      bolt11: 'lnbc10u1pmainnetinvoice',
      config: sampleWallet.config,
    })
  })
})
