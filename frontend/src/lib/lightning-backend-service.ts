import { NWCClient } from '@getalby/sdk'
import { MAX_NWC_CONNECTION_STRING_LENGTH } from '@/lib/lightning-input-limits'
import type { LightningNetworkMode } from '@/lib/lightning-utils'

/** NWC `get_info` chain tip — used to compare against Esplora for the same network. */
export async function fetchNwcChainTipBlockHeight(
  config: LightningConnectionConfig,
): Promise<number> {
  if (config.type !== 'nwc') {
    throw new Error('Unsupported Lightning wallet type')
  }
  const client = new NWCClient({
    nostrWalletConnectUrl: config.connectionString,
  })
  const info = await client.getInfo()
  return info.block_height
}

export type LightningPaymentDirection = 'incoming' | 'outgoing'

export interface LightningPayment {
  paymentHash: string
  pending: boolean
  /** Absolute amount in satoshis (incoming or outgoing). */
  amountSats: number
  memo: string
  timestamp: number
  bolt11: string
  direction: LightningPaymentDirection
  /** Fee component in sats when reported by NWC (millisatoshis floored). */
  feesPaidSats: number
}

export interface LightningBackendService {
  getBalance(): Promise<{ balanceSats: number }>
  createInvoice(params: {
    amountSats: number
    memo?: string
    expiry?: number
  }): Promise<{ bolt11: string; paymentHash: string }>
  /**
   * Pay a BOLT11 invoice. For **amountless** invoices (0 sats in the PR), NIP-47 requires
   * `amount` in millisatoshis so the NWC wallet knows how much to send.
   *
   * NIP-47 `pay_invoice` returns a **payment preimage** (not the payment hash); we expose it
   * as `preimage` for accuracy.
   */
  payInvoice(
    bolt11: string,
    options?: { amountMsats?: number },
  ): Promise<{ preimage: string }>
  listPayments(): Promise<LightningPayment[]>
  testConnection(): Promise<{
    ok: boolean
    walletName?: string
    /** Present when `ok` and the backend exposes a chain tip (NWC `get_info`). */
    nwcBlockHeight?: number
    error?: string
  }>
}

export type LightningWalletType = 'nwc'

export interface NwcConnectionConfig {
  type: 'nwc'
  connectionString: string
}

export type LightningConnectionConfig = NwcConnectionConfig

export interface ConnectedLightningWallet {
  id: string
  walletId: number
  label: string
  /** Lightning network this NWC connection is for (must match app network mode for LN send/receive). */
  networkMode: LightningNetworkMode
  config: LightningConnectionConfig
  createdAt: string
}

const NWC_CONNECTION_STRING_PREFIX = 'nostr+walletconnect://'
const E2E_NWC_MOCK_CONNECTION_STRING = 'nostr+walletconnect://e2e-mock'

export function isValidNwcConnectionString(value: string): boolean {
  const v = value.trim()
  return (
    v.startsWith(NWC_CONNECTION_STRING_PREFIX) &&
    v.length <= MAX_NWC_CONNECTION_STRING_LENGTH
  )
}

function msatsToSats(msats: number): number {
  return Math.floor(msats / 1000)
}

function satsToMsats(sats: number): number {
  return sats * 1000
}

type E2eNwcMockState = {
  shouldFail: boolean
  alias: string
  blockHeight: number
  balanceSats: number
  payments: LightningPayment[]
}

const e2eNwcMockState: E2eNwcMockState = {
  shouldFail: false,
  alias: 'E2E NWC Mock',
  blockHeight: 100,
  balanceSats: 1234,
  payments: [
    {
      paymentHash: 'e2e-mock-payment-1',
      pending: false,
      amountSats: 21,
      memo: 'Initial mock payment',
      timestamp: Math.floor(Date.now() / 1000),
      bolt11: 'lnbc1e2emockpayment1',
      direction: 'incoming',
      feesPaidSats: 0,
    },
  ],
}

type E2eNwcMockControl = {
  setFailing: (value: boolean) => void
  setBalanceSats: (value: number) => void
  addPayment: (payment: LightningPayment) => void
  reset: () => void
}

function isE2eNwcMockEnabled(): boolean {
  return import.meta.env.VITE_E2E_NWC_MOCK === 'true' && import.meta.env.DEV
}

function ensureE2eNwcMockControl(): void {
  if (!isE2eNwcMockEnabled() || typeof window === 'undefined') return
  if (window.__E2E_NWC__ != null) return
  const control: E2eNwcMockControl = {
    setFailing: (value) => {
      e2eNwcMockState.shouldFail = value
    },
    setBalanceSats: (value) => {
      e2eNwcMockState.balanceSats = Math.max(0, Math.floor(value))
    },
    addPayment: (payment) => {
      e2eNwcMockState.payments = [payment, ...e2eNwcMockState.payments]
    },
    reset: () => {
      e2eNwcMockState.shouldFail = false
      e2eNwcMockState.alias = 'E2E NWC Mock'
      e2eNwcMockState.blockHeight = 100
      e2eNwcMockState.balanceSats = 1234
      e2eNwcMockState.payments = [
        {
          paymentHash: 'e2e-mock-payment-1',
          pending: false,
          amountSats: 21,
          memo: 'Initial mock payment',
          timestamp: Math.floor(Date.now() / 1000),
          bolt11: 'lnbc1e2emockpayment1',
          direction: 'incoming',
          feesPaidSats: 0,
        },
      ]
    },
  }
  window.__E2E_NWC__ = control
}

function throwIfE2eNwcMockFailing(): void {
  if (e2eNwcMockState.shouldFail) {
    throw new Error('E2E NWC mock: simulated connection error')
  }
}

function createE2eNwcMockBackendService(): LightningBackendService {
  ensureE2eNwcMockControl()
  return {
    async getBalance() {
      throwIfE2eNwcMockFailing()
      return { balanceSats: e2eNwcMockState.balanceSats }
    },
    async createInvoice(params) {
      throwIfE2eNwcMockFailing()
      const sats = Math.max(0, Math.floor(params.amountSats))
      const paymentHash = `e2e-invoice-${Date.now()}`
      return {
        bolt11: `lnbc1e2einvoice${sats}`,
        paymentHash,
      }
    },
    async payInvoice() {
      throwIfE2eNwcMockFailing()
      return { preimage: `e2e-preimage-${Date.now()}` }
    },
    async listPayments() {
      throwIfE2eNwcMockFailing()
      return [...e2eNwcMockState.payments]
    },
    async testConnection() {
      if (e2eNwcMockState.shouldFail) {
        return { ok: false, error: 'E2E NWC mock: simulated connection error' }
      }
      return {
        ok: true,
        walletName: e2eNwcMockState.alias,
        nwcBlockHeight: e2eNwcMockState.blockHeight,
      }
    },
  }
}

function createNwcBackendService(
  config: NwcConnectionConfig,
): LightningBackendService {
  const client = new NWCClient({
    nostrWalletConnectUrl: config.connectionString,
  })

  return {
    async getBalance() {
      const result = await client.getBalance()
      return { balanceSats: msatsToSats(result.balance) }
    },

    async createInvoice(params) {
      const result = await client.makeInvoice({
        amount: satsToMsats(params.amountSats),
        description: params.memo,
        expiry: params.expiry,
      })
      return {
        bolt11: result.invoice,
        paymentHash: result.payment_hash,
      }
    },

    async payInvoice(bolt11, options) {
      const result = await client.payInvoice({
        invoice: bolt11,
        ...(options?.amountMsats != null
          ? { amount: options.amountMsats }
          : {}),
      })
      return { preimage: result.preimage }
    },

    async listPayments() {
      const result = await client.listTransactions({})
      return result.transactions.map((tx) => ({
        paymentHash: tx.payment_hash,
        pending: tx.state === 'pending',
        amountSats: msatsToSats(tx.amount),
        memo: tx.description,
        timestamp: tx.created_at,
        bolt11: tx.invoice,
        direction: tx.type,
        feesPaidSats: msatsToSats(tx.fees_paid),
      }))
    },

    async testConnection() {
      try {
        const info = await client.getInfo()
        return {
          ok: true,
          walletName: info.alias || 'NWC Wallet',
          nwcBlockHeight: info.block_height,
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error'
        return { ok: false, error: message }
      }
    },
  }
}

export function createBackendService(
  config: LightningConnectionConfig,
): LightningBackendService {
  if (
    isE2eNwcMockEnabled() &&
    config.type === 'nwc' &&
    config.connectionString.trim() === E2E_NWC_MOCK_CONNECTION_STRING
  ) {
    return createE2eNwcMockBackendService()
  }
  switch (config.type) {
    case 'nwc':
      return createNwcBackendService(config)
    default:
      throw new Error(
        `Unsupported Lightning wallet type: ${(config as { type: string }).type}`,
      )
  }
}
