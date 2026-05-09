import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@/test-utils/test-providers'
import * as lightningUtils from '@/lib/lightning-utils'

const mockNavigate = vi.fn()
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    createFileRoute: (_path: string) => (options: Record<string, unknown>) => ({
      options,
    }),
    useNavigate: () => mockNavigate,
    Link: ({
      to,
      children,
      className,
    }: {
      to: string
      children: React.ReactNode
      className?: string
    }) => (
      <a href={to} className={className}>
        {children}
      </a>
    ),
  }
})

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  return {
    ...actual,
    useQueries: (opts: { queries: unknown[] }) =>
      (opts.queries as unknown[]).map(() => ({
        data: { balanceSats: 50_000_000 },
        isSuccess: true,
        isPending: false,
        isError: false,
      })),
  }
})

vi.mock('@/stores/cryptoStore', () => ({
  useCryptoStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      syncWallet: vi.fn(),
      getBalance: vi.fn(),
      getTransactionList: vi.fn(),
      exportChangeset: vi.fn(),
    }),
}))

let walletStoreState: Record<string, unknown> = {}
vi.mock('@/stores/walletStore', () => ({
  useWalletStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector(walletStoreState),
  NETWORK_LABELS: {
    lab: 'Lab',
    regtest: 'Regtest',
    signet: 'Signet',
    testnet: 'Testnet',
    mainnet: 'Mainnet',
  },
}))

vi.mock('@/stores/sessionStore', () => ({
  useSessionStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ password: 'testpass' }),
}))

vi.mock('@/stores/featureStore', () => ({
  useFeatureStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ lightningEnabled: true }),
}))

const mockConnections = [
  {
    id: 'c1',
    walletId: 1,
    label: 'Hub A',
    networkMode: 'signet' as const,
    config: { type: 'nwc' as const, connectionString: 'nostr+walletconnect://a' },
    createdAt: '',
  },
]

vi.mock('@/stores/lightningStore', () => ({
  useLightningStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      connectedWallets: mockConnections,
      getConnectionsForWallet: () => mockConnections,
      getActiveConnection: () => mockConnections[0],
    }),
}))

const sendStoreState: Record<string, unknown> = {
  step: 1,
  recipient: '',
  amount: '',
  amountUnit: 'sat',
  feePresetSelection: 'Medium',
  feeRate: 2,
  customFeeRate: '',
  useCustomFee: false,
  psbt: null,
  onchainDustWarning: null,
  setStep: vi.fn(),
  setRecipient: vi.fn((v: string) => {
    sendStoreState.recipient = v
  }),
  setAmount: vi.fn((v: string) => {
    sendStoreState.amount = v
  }),
  setAmountUnit: vi.fn(),
  setFeePresetSelection: vi.fn(),
  setFeeRate: vi.fn(),
  setCustomFeeRate: vi.fn(),
  setUseCustomFee: vi.fn(),
  setPsbt: vi.fn(),
  setOnchainDustWarning: vi.fn(),
  reset: vi.fn(),
}

vi.mock('@/stores/sendStore', () => ({
  useSendStore: (selector?: (s: Record<string, unknown>) => unknown) => {
    if (typeof selector !== 'function') return sendStoreState
    return selector(sendStoreState)
  },
}))

vi.mock('@/hooks/useSendMutations', () => ({
  useBuildTransactionMutation: () => ({
    isPending: false,
    mutate: vi.fn(),
  }),
  useBroadcastTransactionMutation: () => ({
    isPending: false,
    mutate: vi.fn(),
  }),
  useLabSendMutation: () => ({
    isPending: false,
    mutate: vi.fn(),
  }),
}))

vi.mock('@/hooks/useLightningMutations', () => ({
  useLightningPayMutation: () => ({
    isPending: false,
    mutate: vi.fn(),
  }),
}))

vi.mock('@/hooks/useLabChainStateQuery', () => ({
  useLabChainStateQuery: () => ({ data: null, isPending: false }),
}))

vi.mock('@/hooks/useEsploraFeePresets', () => ({
  useEsploraFeePresets: () => ({
    data: { Low: 0.5, Medium: 2, High: 10 },
    isFetching: false,
  }),
}))

vi.mock('@/hooks/useBitcoinUnit', () => ({
  useBitcoinUnit: () => ({ data: 'BTC' }),
}))

vi.mock('@/lib/bitcoin-utils', () => ({
  MAX_SAFE_SATS: Number.MAX_SAFE_INTEGER,
  isValidAddress: (addr: string) => addr.startsWith('bc1'),
  truncateAddress: (a: string) => a.slice(0, 8),
}))

import { SendFlow } from '../send'

describe('SendFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sendStoreState.recipient = ''
    sendStoreState.amount = '1000'
    walletStoreState = {
      activeWalletId: 1,
      walletStatus: 'unlocked',
      networkMode: 'signet',
      balance: {
        confirmed: 100_000_000,
        trusted_pending: 0,
        untrusted_pending: 0,
        immature: 0,
        total: 100_000_000,
      },
      currentAddress: 'tb1qtest',
      lastSyncTime: null,
      transactions: [],
      setWalletStatus: vi.fn(),
      setBalance: vi.fn(),
      setTransactions: vi.fn(),
      setLastSyncTime: vi.fn(),
    }
    vi.spyOn(lightningUtils, 'tryDecodeBolt11Invoice').mockReturnValue({
      paymentHash: 'h',
      satoshi: 1000,
      timestamp: 1,
      expiry: 3600,
      description: 'test',
    })
  })

  it('shows on-chain fee controls for a Bitcoin address', () => {
    sendStoreState.recipient = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq'
    renderWithProviders(<SendFlow />)
    expect(screen.getByText(/Fee Rate \(sat\/vB\)/)).toBeInTheDocument()
  })

  it('hides fee controls for a BOLT11 invoice on Lightning-capable network', () => {
    sendStoreState.recipient =
      'lntbs1testinvoiceplaceholder123456789012345678901234567890'
    renderWithProviders(<SendFlow />)
    expect(screen.queryByText(/Fee Rate \(sat\/vB\)/)).not.toBeInTheDocument()
    expect(screen.getByText('Send Lightning')).toBeInTheDocument()
  })

  it('defaults unified BIP21 (?lightning=…) to Lightning not on-chain balance check', () => {
    sendStoreState.recipient =
      'bitcoin:bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq?amount=0.00001&lightning=lntbs1testinvoiceplaceholder123456789012345678901234567890'
    renderWithProviders(<SendFlow />)
    expect(screen.queryByText(/Fee Rate \(sat\/vB\)/)).not.toBeInTheDocument()
    expect(screen.getByText('Send Lightning')).toBeInTheDocument()
  })
})
