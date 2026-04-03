import type { TransactionDetails } from '@/workers/crypto-types'
import { useWalletStore } from '@/stores/walletStore'
import {
  hasNetworkConnectedWallet,
  useLightningStore,
} from '@/stores/lightningStore'
import { useFeatureStore } from '@/stores/featureStore'
import {
  createBackendService,
  type ConnectedLightningWallet,
  type LightningPayment,
} from '@/lib/lightning-backend-service'
import type { LightningNetworkMode } from '@/lib/lightning-utils'
import { appQueryClient } from '@/lib/app-query-client'

/** React Query key prefix for dashboard Lightning data (invalidate all with `['lightning-dashboard']`). */
export const LIGHTNING_DASHBOARD_QUERY_KEY = ['lightning-dashboard'] as const

export function lightningDashboardHistoryQueryKey(
  connectionFingerprint: string,
): readonly ['lightning-dashboard', 'history', string] {
  return [...LIGHTNING_DASHBOARD_QUERY_KEY, 'history', connectionFingerprint]
}

export function lightningDashboardBalancesQueryKey(
  connectionFingerprint: string,
): readonly ['lightning-dashboard', 'balances', string] {
  return [...LIGHTNING_DASHBOARD_QUERY_KEY, 'balances', connectionFingerprint]
}

/** Stable key segment from matching connections (ids sorted). */
export function lightningConnectionsFingerprint(
  connections: ConnectedLightningWallet[],
): string {
  return [...connections.map((c) => c.id)].sort().join(',')
}

export function getMatchingLightningConnectionsForDashboard(): ConnectedLightningWallet[] {
  const { activeWalletId, networkMode } = useWalletStore.getState()
  const { lightningEnabled } = useFeatureStore.getState()
  const { connectedWallets } = useLightningStore.getState()

  if (
    !lightningEnabled ||
    activeWalletId == null ||
    !hasNetworkConnectedWallet(connectedWallets, activeWalletId, networkMode)
  ) {
    return []
  }

  const lnMode = networkMode as LightningNetworkMode
  return connectedWallets.filter(
    (w) => w.walletId === activeWalletId && w.networkMode === lnMode,
  )
}

export interface LightningBalanceRow {
  connectionId: string
  label: string
  balanceSats: number
  error?: string
}

export interface LightningBalancesResult {
  perWallet: LightningBalanceRow[]
  totalSats: number
}

/** NWC payment row plus the Bitboard connection label that reported it. */
export type LightningPaymentWithWallet = LightningPayment & {
  connectionId: string
  walletLabel: string
}

/**
 * Fetches merged NWC payment history for all Lightning connections matching the
 * active wallet and current network. Dedupes by `payment_hash` (first connection
 * wins). Partial failures omit that connection’s rows but do not throw.
 */
export async function fetchLightningPaymentsForActiveWallet(): Promise<
  LightningPaymentWithWallet[]
> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return []
  }

  const matches = getMatchingLightningConnectionsForDashboard()
  if (matches.length === 0) {
    return []
  }

  const byHash = new Map<string, LightningPaymentWithWallet>()

  for (const conn of matches) {
    try {
      const service = createBackendService(conn.config)
      const payments = await service.listPayments()
      for (const p of payments) {
        if (!byHash.has(p.paymentHash)) {
          byHash.set(p.paymentHash, {
            ...p,
            connectionId: conn.id,
            walletLabel: conn.label,
          })
        }
      }
    } catch {
      // Other connections may still succeed
    }
  }

  return [...byHash.values()]
}

/** Call after Esplora sync so NWC history and balances refresh. */
export function invalidateLightningDashboardQueries(): void {
  void appQueryClient.invalidateQueries({ queryKey: [...LIGHTNING_DASHBOARD_QUERY_KEY] })
}

/**
 * Fetches `getBalance` for each matching connection. Uses `allSettled` so one
 * failing wallet does not drop the rest.
 */
export async function fetchLightningBalancesForDashboard(): Promise<LightningBalancesResult> {
  const matches = getMatchingLightningConnectionsForDashboard()
  if (matches.length === 0) {
    return { perWallet: [], totalSats: 0 }
  }

  const settled = await Promise.allSettled(
    matches.map(async (conn) => {
      const service = createBackendService(conn.config)
      const { balanceSats } = await service.getBalance()
      return {
        connectionId: conn.id,
        label: conn.label,
        balanceSats,
      } satisfies LightningBalanceRow
    }),
  )

  const perWallet: LightningBalanceRow[] = []
  let totalSats = 0

  settled.forEach((result, index) => {
    const conn = matches[index]
    if (result.status === 'fulfilled') {
      const row = result.value
      perWallet.push(row)
      totalSats += row.balanceSats
    } else {
      const message =
        result.reason instanceof Error
          ? result.reason.message
          : 'Balance unavailable'
      perWallet.push({
        connectionId: conn.id,
        label: conn.label,
        balanceSats: 0,
        error: message,
      })
    }
  })

  return { perWallet, totalSats }
}

export type DashboardActivityItem =
  | { kind: 'chain'; tx: TransactionDetails }
  | { kind: 'lightning'; payment: LightningPaymentWithWallet }

function chainSortTime(tx: TransactionDetails): number {
  if (tx.confirmation_time != null) {
    return tx.confirmation_time
  }
  return 0
}

function lightningSortTime(p: LightningPaymentWithWallet): number {
  return p.timestamp
}

/**
 * Merges on-chain and Lightning activity, newest first (by sort timestamp).
 */
export function mergeAndSortDashboardActivity(
  onChain: TransactionDetails[],
  lightning: LightningPaymentWithWallet[],
): DashboardActivityItem[] {
  const items: DashboardActivityItem[] = [
    ...onChain.map((tx) => ({ kind: 'chain' as const, tx })),
    ...lightning.map((payment) => ({ kind: 'lightning' as const, payment })),
  ]

  items.sort((a, b) => {
    const ta =
      a.kind === 'chain'
        ? chainSortTime(a.tx)
        : lightningSortTime(a.payment)
    const tb =
      b.kind === 'chain'
        ? chainSortTime(b.tx)
        : lightningSortTime(b.payment)
    return tb - ta
  })

  return items
}
