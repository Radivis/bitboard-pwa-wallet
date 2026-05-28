import { MSATS_PER_SAT } from '@/lib/wallet/bitcoin-utils'
import type {
  LightningPayment,
  LightningPaymentDirection,
  NwcTestConnectionResult,
} from '@/lib/lightning/lightning-backend-service'
import { lightningNetworkModeFromNip47Network } from '@/lib/lightning/lightning-utils'
import type {
  WireNwcBalanceResponse,
  WireNwcMakeInvoiceResult,
  WireNwcTransaction,
  WireNwcWalletInfo,
} from '@/lib/lightning/lightning-wire-types'

function msatsToSats(msats: number): number {
  return Math.floor(msats / MSATS_PER_SAT)
}

export function mapWireNwcBalanceToDomain(
  wire: WireNwcBalanceResponse,
): { balanceSats: number } {
  return { balanceSats: msatsToSats(wire.balance) }
}

export function mapWireNwcMakeInvoiceToDomain(
  wire: WireNwcMakeInvoiceResult,
): { bolt11: string; paymentHash: string } {
  return {
    bolt11: wire.invoice,
    paymentHash: wire.payment_hash,
  }
}

export function mapWireNwcTransactionToDomain(
  wire: WireNwcTransaction,
): LightningPayment {
  return {
    paymentHash: wire.payment_hash,
    isPending: wire.state === 'pending',
    amountSats: msatsToSats(wire.amount),
    memo: wire.description,
    timestamp: wire.created_at,
    bolt11: wire.invoice,
    direction: wire.type as LightningPaymentDirection,
    feesPaidSats: msatsToSats(wire.fees_paid),
  }
}

export function mapWireNwcWalletInfoBlockHeight(wire: WireNwcWalletInfo): number {
  return wire.block_height ?? 0
}

/**
 * Maps `get_info` to a successful test-connection result, or `{ ok: false, error }` when
 * network is missing or unsupported.
 */
export function mapWireNwcWalletInfoToTestConnectionResult(
  wire: WireNwcWalletInfo,
): NwcTestConnectionResult {
  const rawNetwork = wire.network
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
      walletName: wire.alias || 'NWC Wallet',
      nwcBlockHeight: wire.block_height,
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
}
