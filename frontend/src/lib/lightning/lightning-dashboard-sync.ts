import type { TransactionDetails } from '@/workers/crypto-types'
import { useWalletStore } from '@/stores/walletStore'
import { useLightningStore } from '@/stores/lightningStore'
import { useFeatureStore } from '@/stores/featureStore'
import { useSessionStore } from '@/stores/sessionStore'
import {
  createBackendService,
  type ConnectedLightningWallet,
  type LightningPayment,
} from '@/lib/lightning/lightning-backend-service'
import { getLightningConnectionsForActiveWallet } from '@/lib/lightning/lightning-connection-utils'
import { appQueryClient } from '@/lib/shared/app-query-client'
import { ensureMigrated, getDatabase } from '@/db/database'
import { loadWalletSecretsPayload } from '@/db/wallet-persistence'
import {
  batchApplyNwcSnapshotPatches,
  snapshotMapFromPayload,
} from '@/lib/lightning/lightning-wallet-snapshot-persistence'
import type { NwcConnectionSnapshot } from '@/lib/wallet/wallet-domain-types'
import { WALLET_DB_QUERY_KEY_ROOT } from '@/lib/wallet/wallet-query-key-root'

/** React Query key prefix for dashboard Lightning data (invalidate all with prefix). */
export const LIGHTNING_DASHBOARD_QUERY_KEY = [
  ...WALLET_DB_QUERY_KEY_ROOT,
  'lightning',
  'dashboard',
] as const

export function lightningDashboardHistoryQueryKey(
  connectionFingerprint: string,
): readonly ['wallet_db', 'lightning', 'dashboard', 'history', string] {
  return [...LIGHTNING_DASHBOARD_QUERY_KEY, 'history', connectionFingerprint]
}

export function lightningDashboardBalancesQueryKey(
  connectionFingerprint: string,
): readonly ['wallet_db', 'lightning', 'dashboard', 'balances', string] {
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

  return getLightningConnectionsForActiveWallet({
    connectedLightningWallets: connectedWallets,
    activeWalletId,
    networkMode,
    isLightningEnabled: lightningEnabled,
  })
}

export interface LightningBalanceRow {
  connectionId: string
  label: string
  balanceSats: number
  /** Set when live NWC failed but a local snapshot exists. */
  isStaleBalance?: boolean
  balanceSnapshotAt?: string
  /** Only when live fetch failed and no usable balance snapshot. */
  error?: string
}

export interface LightningBalancesResult {
  lightningBalanceRows: LightningBalanceRow[]
  totalSats: number
}

/** NWC payment row plus the Bitboard connection label that reported it. */
export type LightningPaymentWithWallet = LightningPayment & {
  connectionId: string
  walletLabel: string
}

/** React Query data shape for Lightning activity (includes optional cache metadata). */
export interface LightningHistoryQueryResult {
  payments: LightningPaymentWithWallet[]
  /** Latest `payments_updated_at` among snapshots used when NWC failed (ISO). */
  stalePaymentsAsOf?: string
}

function maxIsoTimestamp(a: string | undefined, b: string | undefined): string | undefined {
  if (a == null) return b
  if (b == null) return a
  return a > b ? a : b
}

async function readSnapshotMapForActiveWallet(): Promise<
  Map<string, NwcConnectionSnapshot | undefined>
> {
  const password = useSessionStore.getState().password
  const walletId = useWalletStore.getState().activeWalletId
  if (password == null || walletId == null) {
    return new Map()
  }
  const payload = await loadWalletSecretsPayload(
    getDatabase(),
    password,
    walletId,
  )
  return snapshotMapFromPayload(payload)
}

/**
 * Fetches merged NWC payment history for all Lightning connections matching the
 * active wallet and current network. Dedupes by `payment_hash` (first connection
 * wins). On failure, merges stored payments from encrypted wallet secrets when available.
 */
export async function fetchLightningPaymentsForActiveWallet(): Promise<
  LightningHistoryQueryResult
> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { payments: [] }
  }

  const matches = getMatchingLightningConnectionsForDashboard()
  if (matches.length === 0) {
    return { payments: [] }
  }

  await ensureMigrated()

  const snapshotById = await readSnapshotMapForActiveWallet()

  const byHash = new Map<string, LightningPaymentWithWallet>()
  let listPaymentsFailureCount = 0
  let stalePaymentsAsOf: string | undefined

  const paymentPatches: {
    connectionId: string
    payments: { payments: LightningPayment[]; paymentsUpdatedAt: string }
  }[] = []

  for (const lightningConnection of matches) {
    try {
      const service = createBackendService(lightningConnection.config)
      const payments = await service.listPayments()
      const nowIso = new Date().toISOString()
      paymentPatches.push({
        connectionId: lightningConnection.id,
        payments: { payments, paymentsUpdatedAt: nowIso },
      })
      for (const payment of payments) {
        if (!byHash.has(payment.paymentHash)) {
          byHash.set(payment.paymentHash, {
            ...payment,
            connectionId: lightningConnection.id,
            walletLabel: lightningConnection.label,
          })
        }
      }
    } catch (listPaymentsError) {
      listPaymentsFailureCount += 1
      if (import.meta.env.DEV) {
        console.debug(
          '[lightning-dashboard] listPayments failed for connection',
          { id: lightningConnection.id, label: lightningConnection.label },
          listPaymentsError,
        )
      }
      const snap = snapshotById.get(lightningConnection.id)
      if (snap?.paymentsUpdatedAt != null) {
        stalePaymentsAsOf = maxIsoTimestamp(
          stalePaymentsAsOf,
          snap.paymentsUpdatedAt,
        )
        for (const payment of snap.payments) {
          if (!byHash.has(payment.paymentHash)) {
            byHash.set(payment.paymentHash, {
              ...payment,
              connectionId: lightningConnection.id,
              walletLabel: lightningConnection.label,
            })
          }
        }
      }
    }
  }

  const password = useSessionStore.getState().password
  const walletId = useWalletStore.getState().activeWalletId
  if (password != null && walletId != null && paymentPatches.length > 0) {
    await batchApplyNwcSnapshotPatches({
      password,
      walletId,
      patches: paymentPatches,
    })
  }

  if (listPaymentsFailureCount === matches.length && matches.length > 0) {
    console.warn(
      '[lightning-dashboard] All Lightning connections failed to list payments',
    )
  }

  return {
    payments: [...byHash.values()],
    ...(stalePaymentsAsOf != null ? { stalePaymentsAsOf } : {}),
  }
}

/** Call after Esplora sync so NWC history and balances refresh. */
export function invalidateLightningDashboardQueries(): void {
  void appQueryClient.invalidateQueries({ queryKey: [...LIGHTNING_DASHBOARD_QUERY_KEY] })
}

/**
 * Fetches `getBalance` for each matching connection. Uses `allSettled` so one
 * failing wallet does not drop the rest. Persists successful reads into encrypted
 * wallet secrets and falls back to snapshots when NWC fails.
 */
export async function fetchLightningBalancesForDashboard(): Promise<LightningBalancesResult> {
  const matches = getMatchingLightningConnectionsForDashboard()
  if (matches.length === 0) {
    return { lightningBalanceRows: [], totalSats: 0 }
  }

  await ensureMigrated()

  const snapshotById = await readSnapshotMapForActiveWallet()

  const settled = await Promise.allSettled(
    matches.map(async (lightningConnection) => {
      const service = createBackendService(lightningConnection.config)
      const { balanceSats } = await service.getBalance()
      return {
        connectionId: lightningConnection.id,
        label: lightningConnection.label,
        balanceSats,
        balanceUpdatedAt: new Date().toISOString(),
      }
    }),
  )

  const balancePatches: {
    connectionId: string
    balance: { balanceSats: number; balanceUpdatedAt: string }
  }[] = []

  for (let index = 0; index < settled.length; index += 1) {
    const settledOutcome = settled[index]
    if (settledOutcome.status === 'fulfilled') {
      const fulfilledValue = settledOutcome.value
      balancePatches.push({
        connectionId: fulfilledValue.connectionId,
        balance: {
          balanceSats: fulfilledValue.balanceSats,
          balanceUpdatedAt: fulfilledValue.balanceUpdatedAt,
        },
      })
    }
  }

  const password = useSessionStore.getState().password
  const walletId = useWalletStore.getState().activeWalletId
  if (password != null && walletId != null && balancePatches.length > 0) {
    await batchApplyNwcSnapshotPatches({
      password,
      walletId,
      patches: balancePatches,
    })
  }

  const lightningBalanceRows: LightningBalanceRow[] = []
  let totalSats = 0

  for (let index = 0; index < settled.length; index += 1) {
    const settledOutcome = settled[index]
    const lightningConnection = matches[index]
    if (settledOutcome.status === 'fulfilled') {
      const row = settledOutcome.value
      lightningBalanceRows.push({
        connectionId: row.connectionId,
        label: row.label,
        balanceSats: row.balanceSats,
      })
      totalSats += row.balanceSats
      continue
    }
    const snap = snapshotById.get(lightningConnection.id)
    if (snap != null && snap.balanceUpdatedAt.length > 0) {
      const staleRow: LightningBalanceRow = {
        connectionId: lightningConnection.id,
        label: lightningConnection.label,
        balanceSats: snap.balanceSats,
        isStaleBalance: true,
        balanceSnapshotAt: snap.balanceUpdatedAt,
      }
      lightningBalanceRows.push(staleRow)
      totalSats += staleRow.balanceSats
      continue
    }
    const message =
      settledOutcome.reason instanceof Error
        ? settledOutcome.reason.message
        : 'Balance unavailable'
    lightningBalanceRows.push({
      connectionId: lightningConnection.id,
      label: lightningConnection.label,
      balanceSats: 0,
      error: message,
    })
  }

  return { lightningBalanceRows, totalSats }
}

export type DashboardActivityItem =
  | { kind: 'chain'; tx: TransactionDetails }
  | { kind: 'lightning'; payment: LightningPaymentWithWallet }

/** Sort key so unconfirmed on-chain txs stay above confirmed history (see lab mempool ordering). */
const UNCONFIRMED_CHAIN_SORT_PRIORITY = Number.MAX_SAFE_INTEGER

function chainSortTime(tx: TransactionDetails): number {
  if (!tx.is_confirmed) {
    return UNCONFIRMED_CHAIN_SORT_PRIORITY
  }
  return tx.confirmation_time ?? 0
}

function lightningSortTime(p: LightningPaymentWithWallet): number {
  return p.timestamp
}

/**
 * Merges on-chain and Lightning activity, newest first (by sort timestamp).
 * Unconfirmed on-chain txs are prioritized so they are not pushed out of the dashboard top-N slice.
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
