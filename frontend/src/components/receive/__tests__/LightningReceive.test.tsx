import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    Link: ({ children }: { children: ReactNode }) => <a href="/wallet/management">{children}</a>,
  }
})

import userEvent from '@testing-library/user-event'
import { LightningReceive } from '@/components/receive/LightningReceive'
import { DEFAULT_INVOICE_EXPIRY_SECONDS } from '@/lib/lightning/lightning-utils'
import { useBitcoinDisplayUnitStore } from '@/stores/bitcoinDisplayUnitStore'
import { useFiatDenominationStore } from '@/stores/fiatDenominationStore'
import {
  useLightningStore,
  type ConnectedLightningWallet,
  type LightningInvoice,
} from '@/stores/lightningStore'
import { useReceiveStore } from '@/stores/receiveStore'
import { useWalletStore } from '@/stores/walletStore'
import { renderWithProviders } from '@/test-utils/test-providers'

const AMOUNTLESS_BOLT11 = 'lnbc1amountlessinvoice'

function amountlessInvoice(description: string): LightningInvoice {
  return {
    bolt11: AMOUNTLESS_BOLT11,
    paymentHash: 'hash-amountless',
    amountSats: null,
    description,
    expirySeconds: DEFAULT_INVOICE_EXPIRY_SECONDS,
    createdAt: new Date().toISOString(),
    status: 'pending',
  }
}

describe('LightningReceive amountless invoices', () => {
  const originalCreateInvoice = useLightningStore.getState().createInvoice
  const createInvoice = vi.fn(async (params: { description: string }) =>
    amountlessInvoice(params.description),
  )

  afterEach(() => {
    useReceiveStore.setState({ activeInvoice: null, sessionInvoices: [] })
    useWalletStore.setState({ activeWalletId: null, networkMode: 'testnet' })
    useLightningStore.setState({
      connectedWallets: [],
      activeConnectionIds: {},
      createInvoice: originalCreateInvoice,
    })
    useBitcoinDisplayUnitStore.setState({ defaultBitcoinUnit: 'sat' })
    useFiatDenominationStore.setState({ fiatDenominationMode: false })
    createInvoice.mockClear()
  })

  function renderReceiveForm() {
    const connection: ConnectedLightningWallet = {
      id: 'nwc-1',
      walletId: 1,
      label: 'Test wallet',
      networkMode: 'signet',
      config: {
        type: 'nwc',
        connectionString: 'nostr+walletconnect://example?relay=wss%3A%2F%2Frelay.example&secret=ab',
      },
      createdAt: '2026-01-01T00:00:00.000Z',
    }
    useWalletStore.setState({ activeWalletId: 1, networkMode: 'signet' })
    useLightningStore.setState({
      createInvoice,
      connectedWallets: [connection],
      activeConnectionIds: { 1: { signet: connection.id } },
    })
    renderWithProviders(<LightningReceive />)
  }

  it('creates an amountless invoice when the amount is left empty', async () => {
    const user = userEvent.setup()
    renderReceiveForm()

    expect(screen.getByText(/must be specified by payer/i)).toBeInTheDocument()

    await user.type(screen.getByLabelText(/description/i), 'Coffee tip')
    await user.click(screen.getByRole('button', { name: 'Create Invoice' }))

    expect(createInvoice).toHaveBeenCalledWith({
      description: 'Coffee tip',
      expirySeconds: DEFAULT_INVOICE_EXPIRY_SECONDS,
      networkMode: 'signet',
    })
    expect(await screen.findByText('Amount set by payer')).toBeInTheDocument()
    expect(screen.getByText(AMOUNTLESS_BOLT11)).toBeInTheDocument()
    expect(screen.getByText('Coffee tip')).toBeInTheDocument()
  })

  it('creates an amountless invoice when the amount is zero', async () => {
    const user = userEvent.setup()
    renderReceiveForm()

    await user.type(screen.getByLabelText(/amount/i), '0')
    await user.click(screen.getByRole('button', { name: 'Create Invoice' }))

    expect(createInvoice).toHaveBeenCalledWith(
      expect.not.objectContaining({ amountSats: expect.anything() }),
    )
    expect(await screen.findByText('Amount set by payer')).toBeInTheDocument()
  })
})
