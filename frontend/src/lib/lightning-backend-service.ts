import { NWCClient } from '@getalby/sdk'
import { MAX_NWC_CONNECTION_STRING_LENGTH } from '@/lib/lightning-input-limits'
import {
  lightningNetworkModeFromNip47Network,
  type LightningNetworkMode,
} from '@/lib/lightning-utils'

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
  /** Omit `amountSats` (or leave unset) for an amountless BOLT11; payer supplies amount when paying. */
  createInvoice(params: {
    amountSats?: number
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
  testConnection(): Promise<NwcTestConnectionResult>
}

/** Result of probing an NWC wallet; on success includes chain from `get_info.network`. */
export type NwcTestConnectionResult =
  | {
      ok: true
      walletName: string
      /** Present when the backend exposes a chain tip (NWC `get_info`). */
      nwcBlockHeight?: number
      lightningNetworkMode: LightningNetworkMode
    }
  | { ok: false; error: string }

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

const MSATS_PER_SAT = 1000

export function isValidNwcConnectionString(value: string): boolean {
  const v = value.trim()
  return (
    v.startsWith(NWC_CONNECTION_STRING_PREFIX) &&
    v.length <= MAX_NWC_CONNECTION_STRING_LENGTH
  )
}

function msatsToSats(msats: number): number {
  return Math.floor(msats / MSATS_PER_SAT)
}

function satsToMsats(sats: number): number {
  return sats * MSATS_PER_SAT
}

/**
 * NWC amountless `make_invoice`: `@getalby/sdk`'s public `makeInvoice` throws when `amount` is
 * omitted or zero. The client still sends arbitrary params via private `executeNip47Request`.
 * Revisit if the SDK exposes a supported amountless API.
 */
type NwcClientWithExecute = {
  executeNip47Request: <TResult>(
    method: 'make_invoice',
    requestParams: Record<string, unknown>,
    resultValidator: (result: TResult) => boolean,
  ) => Promise<TResult>
}

type NwcMakeInvoiceResult = {
  invoice: string
  payment_hash: string
}

async function nwcCreateInvoice(
  client: NWCClient,
  params: { amountSats?: number; memo?: string; expiry?: number },
): Promise<{ bolt11: string; paymentHash: string }> {
  const fixedAmountSats = params.amountSats
  if (fixedAmountSats != null && fixedAmountSats >= 1) {
    const result = await client.makeInvoice({
      amount: satsToMsats(fixedAmountSats),
      description: params.memo,
      expiry: params.expiry,
    })
    return {
      bolt11: result.invoice,
      paymentHash: result.payment_hash,
    }
  }

  const nip47Params: Record<string, unknown> = {}
  if (params.memo != null && params.memo !== '') {
    nip47Params.description = params.memo
  }
  if (params.expiry != null) {
    nip47Params.expiry = params.expiry
  }

  const exec = client as unknown as NwcClientWithExecute
  const result = await exec.executeNip47Request<NwcMakeInvoiceResult>(
    'make_invoice',
    nip47Params,
    (r) => !!r.invoice,
  )

  return {
    bolt11: result.invoice,
    paymentHash: result.payment_hash,
  }
}

type E2eNwcMockState = {
  shouldFail: boolean
  alias: string
  blockHeight: number
  balanceSats: number
  payments: LightningPayment[]
}

function createInitialE2eMockPayment(): LightningPayment {
  return {
    paymentHash: 'e2e-mock-payment-1',
    pending: false,
    amountSats: 21,
    memo: 'Initial mock payment',
    timestamp: Math.floor(Date.now() / 1000),
    bolt11: 'lnbc1e2emockpayment1',
    direction: 'incoming',
    feesPaidSats: 0,
  }
}

const e2eNwcMockState: E2eNwcMockState = {
  shouldFail: false,
  alias: 'E2E NWC Mock',
  blockHeight: 100,
  balanceSats: 1234,
  payments: [createInitialE2eMockPayment()],
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
      e2eNwcMockState.payments = [createInitialE2eMockPayment()]
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
      const paymentHash = `e2e-invoice-${Date.now()}`
      const fixed = params.amountSats
      if (fixed == null || fixed < 1) {
        return {
          bolt11: 'lnbc1e2einvoiceamountless',
          paymentHash,
        }
      }
      const sats = Math.max(0, Math.floor(fixed))
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
        lightningNetworkMode: 'signet',
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
      return nwcCreateInvoice(client, params)
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

    async testConnection(): Promise<NwcTestConnectionResult> {
      try {
        const info = await client.getInfo()
        const rawNetwork = info.network
        if (rawNetwork == null || String(rawNetwork).trim() === '') {
          return {
            ok: false,
            error:
              'The wallet did not report a network in NWC get_info. Try updating the wallet.',
          }
        }
        const lower = String(rawNetwork).trim().toLowerCase()
        const mode = lightningNetworkModeFromNip47Network(rawNetwork)
        if (mode != null) {
          return {
            ok: true,
            walletName: info.alias || 'NWC Wallet',
            nwcBlockHeight: info.block_height,
            lightningNetworkMode: mode,
          }
        }
        if (lower === 'regtest') {
          return {
            ok: false,
            error:
              'This wallet reports regtest. Bitboard Lightning supports mainnet, testnet, and signet only.',
          }
        }
        return {
          ok: false,
          error: `This wallet reported network "${String(rawNetwork).trim()}", which Bitboard does not support for Lightning. Use mainnet, testnet, or signet.`,
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
