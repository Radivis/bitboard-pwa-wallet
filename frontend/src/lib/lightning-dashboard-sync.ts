import type { TransactionDetails } from '@/workers/crypto-types'
import { useWalletStore } from '@/stores/walletStore'
import { useLightningStore } from '@/stores/lightningStore'
import { useFeatureStore } from '@/stores/featureStore'
import { useSessionStore } from '@/stores/sessionStore'
import {
  createBackendService,
  type ConnectedLightningWallet,
  type LightningPayment,
} from '@/lib/lightning-backend-service'
import { getLightningConnectionsForActiveWallet } from '@/lib/lightning-connection-utils'
import { appQueryClient } from '@/lib/app-query-client'
import { ensureMigrated, getDatabase } from '@/db/database'
import { loadWalletSecretsPayload } from '@/db/wallet-persistence'
import {
  batchApplyNwcSnapshotPatches,
  snapshotMapFromPayload,
} from '@/lib/lightning-wallet-snapshot-persistence'
import type { NwcConnectionSnapshot } from '@/lib/wallet-domain-types'

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

  for (const conn of matches) {
    try {
      const service = createBackendService(conn.config)
      const payments = await service.listPayments()
      const nowIso = new Date().toISOString()
      paymentPatches.push({
        connectionId: conn.id,
        payments: { payments, paymentsUpdatedAt: nowIso },
      })
      for (const p of payments) {
        if (!byHash.has(p.paymentHash)) {
          byHash.set(p.paymentHash, {
            ...p,
            connectionId: conn.id,
            walletLabel: conn.label,
          })
        }
      }
    } catch (err) {
      listPaymentsFailureCount += 1
      if (import.meta.env.DEV) {
        console.debug(
          '[lightning-dashboard] listPayments failed for connection',
          { id: conn.id, label: conn.label },
          err,
        )
      }
      const snap = snapshotById.get(conn.id)
      if (snap?.paymentsUpdatedAt != null) {
        stalePaymentsAsOf = maxIsoTimestamp(
          stalePaymentsAsOf,
          snap.paymentsUpdatedAt,
        )
        for (const p of snap.payments) {
          if (!byHash.has(p.paymentHash)) {
            byHash.set(p.paymentHash, {
              ...p,
              connectionId: conn.id,
              walletLabel: conn.label,
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
    matches.map(async (conn) => {
      const service = createBackendService(conn.config)
      const { balanceSats } = await service.getBalance()
      return {
        connectionId: conn.id,
        label: conn.label,
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
    const result = settled[index]
    if (result.status === 'fulfilled') {
      const v = result.value
      balancePatches.push({
        connectionId: v.connectionId,
        balance: {
          balanceSats: v.balanceSats,
          balanceUpdatedAt: v.balanceUpdatedAt,
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
    const result = settled[index]
    const conn = matches[index]
    if (result.status === 'fulfilled') {
      const row = result.value
      lightningBalanceRows.push({
        connectionId: row.connectionId,
        label: row.label,
        balanceSats: row.balanceSats,
      })
      totalSats += row.balanceSats
      continue
    }
    const snap = snapshotById.get(conn.id)
    if (snap != null && snap.balanceUpdatedAt.length > 0) {
      const staleRow: LightningBalanceRow = {
        connectionId: conn.id,
        label: conn.label,
        balanceSats: snap.balanceSats,
        isStaleBalance: true,
        balanceSnapshotAt: snap.balanceUpdatedAt,
      }
      lightningBalanceRows.push(staleRow)
      totalSats += staleRow.balanceSats
      continue
    }
    const message =
      result.reason instanceof Error
        ? result.reason.message
        : 'Balance unavailable'
    lightningBalanceRows.push({
      connectionId: conn.id,
      label: conn.label,
      balanceSats: 0,
      error: message,
    })
  }

  return { lightningBalanceRows, totalSats }
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
