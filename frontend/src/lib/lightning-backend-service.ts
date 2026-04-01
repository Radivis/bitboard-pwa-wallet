import { NWCClient } from '@getalby/sdk'
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

export interface LightningPayment {
  paymentHash: string
  pending: boolean
  amountSats: number
  memo: string
  timestamp: number
  bolt11: string
}

export interface LightningBackendService {
  getBalance(): Promise<{ balanceSats: number }>
  createInvoice(params: {
    amountSats: number
    memo?: string
    expiry?: number
  }): Promise<{ bolt11: string; paymentHash: string }>
  payInvoice(bolt11: string): Promise<{ paymentHash: string }>
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

export function isValidNwcConnectionString(value: string): boolean {
  return value.startsWith(NWC_CONNECTION_STRING_PREFIX)
}

function msatsToSats(msats: number): number {
  return Math.floor(msats / 1000)
}

function satsToMsats(sats: number): number {
  return sats * 1000
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

    async payInvoice(bolt11) {
      const result = await client.payInvoice({ invoice: bolt11 })
      return { paymentHash: result.preimage }
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
  switch (config.type) {
    case 'nwc':
      return createNwcBackendService(config)
    default:
      throw new Error(
        `Unsupported Lightning wallet type: ${(config as { type: string }).type}`,
      )
  }
}
