import type {
  ConnectedLightningWallet,
  LightningConnectionConfig,
} from '@/lib/lightning/lightning-backend-service'
import type { LightningNetworkMode } from '@/lib/lightning/lightning-utils'
import { WALLET_DB_QUERY_KEY_ROOT } from '@/lib/wallet/wallet-query-key-root'

/** Per-connection NWC balance (wallet management, receive). */
export function lnWalletBalanceQueryKey(params: {
  connectionId: string
  walletId: number
  networkMode: LightningNetworkMode
  config: LightningConnectionConfig
}) {
  return [
    ...WALLET_DB_QUERY_KEY_ROOT,
    'lightning',
    'wallet-balance',
    params.connectionId,
    params.walletId,
    params.networkMode,
    params.config,
  ] as const
}

/** NWC chain tip vs Esplora tip for connection network plausibility checks. */
export function lnNwcNetworkPlausibilityQueryKey(
  wallet: ConnectedLightningWallet | null,
) {
  return [
    ...WALLET_DB_QUERY_KEY_ROOT,
    'lightning',
    'nwc-network-plausibility',
    wallet?.id,
    wallet?.networkMode,
    wallet?.config,
  ] as const
}

/** Send-page connection picker balance (NWC live fetch). */
export function sendPageLnBalanceQueryKey(connectionId: string) {
  return [
    ...WALLET_DB_QUERY_KEY_ROOT,
    'lightning',
    'send-page-balance',
    connectionId,
  ] as const
}
