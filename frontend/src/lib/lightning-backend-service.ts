import { LnbitsClient } from '@/lib/lnbits-client'

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
    error?: string
  }>
}

export type LightningWalletType = 'lnbits'

export interface LnbitsConnectionConfig {
  type: 'lnbits'
  url: string
  adminApiKey: string
}

export type LightningConnectionConfig = LnbitsConnectionConfig

export interface ConnectedLightningWallet {
  id: string
  walletId: number
  label: string
  config: LightningConnectionConfig
  createdAt: string
}

function createLnbitsBackendService(
  config: LnbitsConnectionConfig,
): LightningBackendService {
  const client = new LnbitsClient(config.url, config.adminApiKey)

  return {
    async getBalance() {
      const info = await client.getWalletInfo()
      return { balanceSats: Math.floor(info.balance / 1000) }
    },

    async createInvoice(params) {
      const result = await client.createInvoice({
        amountSats: params.amountSats,
        memo: params.memo,
        expiry: params.expiry,
      })
      return {
        bolt11: result.payment_request,
        paymentHash: result.payment_hash,
      }
    },

    async payInvoice(bolt11) {
      const result = await client.payInvoice(bolt11)
      return { paymentHash: result.payment_hash }
    },

    async listPayments() {
      const payments = await client.listPayments()
      return payments.map((p) => ({
        paymentHash: p.payment_hash,
        pending: p.pending,
        amountSats: Math.floor(Math.abs(p.amount) / 1000),
        memo: p.memo,
        timestamp: p.time,
        bolt11: p.bolt11,
      }))
    },

    async testConnection() {
      try {
        const info = await client.getWalletInfo()
        return { ok: true, walletName: info.name }
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
    case 'lnbits':
      return createLnbitsBackendService(config)
    default:
      throw new Error(`Unsupported Lightning wallet type: ${(config as { type: string }).type}`)
  }
}
