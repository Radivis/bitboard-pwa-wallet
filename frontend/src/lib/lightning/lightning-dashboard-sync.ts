import type { TransactionDetails } from '@/workers/crypto-types'
import type { ArkadePaymentRow } from '@/workers/arkade-api'
import {
  formatTxDirection,
  getTxListDisplayAmountSats,
} from '@/lib/wallet/bitcoin-utils'
import { useWalletStore } from '@/stores/walletStore'
import { useLightningStore } from '@/stores/lightningStore'
import { useFeatureStore } from '@/stores/featureStore'
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
  return [...connections.map((connection) => connection.id)].sort().join(',')
}

export function getMatchingLightningConnectionsForDashboard(): ConnectedLightningWallet[] {
  const { activeWalletId, networkMode } = useWalletStore.getState()
  const { isLightningEnabled } = useFeatureStore.getState()
  const { connectedWallets } = useLightningStore.getState()

  return getLightningConnectionsForActiveWallet({
    connectedLightningWallets: connectedWallets,
    activeWalletId,
    networkMode,
    isLightningEnabled: isLightningEnabled,
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
  const walletId = useWalletStore.getState().activeWalletId
  if (walletId == null) {
    return new Map()
  }
  const payload = await loadWalletSecretsPayload(getDatabase(), walletId)
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
      const connectionSnapshot = snapshotById.get(lightningConnection.id)
      if (connectionSnapshot?.paymentsUpdatedAt != null) {
        stalePaymentsAsOf = maxIsoTimestamp(
          stalePaymentsAsOf,
          connectionSnapshot.paymentsUpdatedAt,
        )
        for (const payment of connectionSnapshot.payments) {
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

  const walletId = useWalletStore.getState().activeWalletId
  if (walletId != null && paymentPatches.length > 0) {
    await batchApplyNwcSnapshotPatches({
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

  const walletId = useWalletStore.getState().activeWalletId
  if (walletId != null && balancePatches.length > 0) {
    await batchApplyNwcSnapshotPatches({
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
      const balanceRow = settledOutcome.value
      lightningBalanceRows.push({
        connectionId: balanceRow.connectionId,
        label: balanceRow.label,
        balanceSats: balanceRow.balanceSats,
      })
      totalSats += balanceRow.balanceSats
      continue
    }
    const connectionSnapshot = snapshotById.get(lightningConnection.id)
    if (connectionSnapshot != null && connectionSnapshot.balanceUpdatedAt.length > 0) {
      const staleRow: LightningBalanceRow = {
        connectionId: lightningConnection.id,
        label: lightningConnection.label,
        balanceSats: connectionSnapshot.balanceSats,
        isStaleBalance: true,
        balanceSnapshotAt: connectionSnapshot.balanceUpdatedAt,
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

export const ARKADE_BOARDING_ACTIVITY_LABEL = 'Arkade boarding' as const
export const ONCHAIN_ARKADE_BOARDING_ACTIVITY_LABEL =
  'Onchain Arkade boarding' as const

export type DashboardActivityItem =
  | { kind: 'chain'; tx: TransactionDetails; activityLabel?: string }
  | { kind: 'lightning'; payment: LightningPaymentWithWallet }
  | {
      kind: 'arkade'
      payment: ArkadePaymentRow
      activityLabel?: string
    }

/** Sort key so unconfirmed on-chain txs stay above confirmed history (see lab mempool ordering). */
const UNCONFIRMED_CHAIN_SORT_PRIORITY = Number.MAX_SAFE_INTEGER

function chainSortTime(tx: TransactionDetails): number {
  if (!tx.isConfirmed) {
    return UNCONFIRMED_CHAIN_SORT_PRIORITY
  }
  return tx.confirmationTime ?? 0
}

function lightningSortTime(payment: LightningPaymentWithWallet): number {
  return payment.timestamp
}

function arkadeSortTime(payment: ArkadePaymentRow): number {
  return payment.timestamp > 0 ? payment.timestamp : 0
}

function dashboardActivitySortTime(item: DashboardActivityItem): number {
  if (item.kind === 'chain') {
    return chainSortTime(item.tx)
  }
  if (item.kind === 'lightning') {
    return lightningSortTime(item.payment)
  }
  return arkadeSortTime(item.payment)
}

/** Boarding onboard often shares a block second with the funding on-chain send. */
const BOARDING_FUNDING_TIMESTAMP_SLACK_SECONDS = 1

function boardingFundingTimestampsMatch(
  chainConfirmationTime: number | null,
  arkadeTimestamp: number,
): boolean {
  if (chainConfirmationTime == null || chainConfirmationTime === 0) {
    return arkadeTimestamp === 0
  }
  if (arkadeTimestamp === 0) {
    return false
  }
  return (
    chainConfirmationTime === arkadeTimestamp ||
    Math.abs(chainConfirmationTime - arkadeTimestamp) <=
      BOARDING_FUNDING_TIMESTAMP_SLACK_SECONDS
  )
}

/** On-chain payment to boarding address paired with the resulting Arkade VTXO credit. */
export function isBoardingFundToVtxoPair(
  chainTx: TransactionDetails,
  arkPayment: ArkadePaymentRow,
): boolean {
  if (!chainTx.isConfirmed) {
    return false
  }
  if (formatTxDirection(chainTx) !== 'sent' || arkPayment.direction !== 'incoming') {
    return false
  }
  if (getTxListDisplayAmountSats(chainTx) !== arkPayment.amountSats) {
    return false
  }
  return boardingFundingTimestampsMatch(chainTx.confirmationTime, arkPayment.timestamp)
}

/**
 * When sort timestamps tie, stable merge order would list on-chain rows before Arkade.
 * For boarding, the VTXO credit should appear above the funding send.
 */
function boardingActivitySortTieBreak(
  left: DashboardActivityItem,
  right: DashboardActivityItem,
): number {
  const leftIsArkIncoming =
    left.kind === 'arkade' && left.payment.direction === 'incoming'
  const rightIsArkIncoming =
    right.kind === 'arkade' && right.payment.direction === 'incoming'
  const leftIsChainSent = left.kind === 'chain' && formatTxDirection(left.tx) === 'sent'
  const rightIsChainSent = right.kind === 'chain' && formatTxDirection(right.tx) === 'sent'

  if (
    leftIsArkIncoming &&
    rightIsChainSent &&
    isBoardingFundToVtxoPair(right.tx, left.payment)
  ) {
    return -1
  }
  if (
    leftIsChainSent &&
    rightIsArkIncoming &&
    isBoardingFundToVtxoPair(left.tx, right.payment)
  ) {
    return 1
  }
  return 0
}

function compareDashboardActivityItems(
  left: DashboardActivityItem,
  right: DashboardActivityItem,
): number {
  const timeDelta = dashboardActivitySortTime(right) - dashboardActivitySortTime(left)
  if (timeDelta !== 0) {
    return timeDelta
  }
  return boardingActivitySortTieBreak(left, right)
}

function applyBoardingActivityLabels(
  items: DashboardActivityItem[],
): DashboardActivityItem[] {
  const labeled = items.map((item) => ({ ...item }))

  for (let chainIndex = 0; chainIndex < labeled.length; chainIndex += 1) {
    const chainItem = labeled[chainIndex]
    if (chainItem.kind !== 'chain') {
      continue
    }
    for (let arkIndex = 0; arkIndex < labeled.length; arkIndex += 1) {
      const arkItem = labeled[arkIndex]
      if (arkItem.kind !== 'arkade') {
        continue
      }
      if (!isBoardingFundToVtxoPair(chainItem.tx, arkItem.payment)) {
        continue
      }
      labeled[chainIndex] = {
        ...chainItem,
        activityLabel: ONCHAIN_ARKADE_BOARDING_ACTIVITY_LABEL,
      }
      labeled[arkIndex] = {
        ...arkItem,
        activityLabel: ARKADE_BOARDING_ACTIVITY_LABEL,
      }
    }
  }

  return labeled
}

/**
 * Merges on-chain, Lightning, and Arkade activity, newest first (by sort timestamp).
 * Unconfirmed on-chain txs are prioritized so they are not pushed out of the dashboard top-N slice.
 */
export function mergeAndSortDashboardActivity(
  onChain: TransactionDetails[],
  lightning: LightningPaymentWithWallet[],
  arkade: ArkadePaymentRow[] = [],
): DashboardActivityItem[] {
  const items: DashboardActivityItem[] = [
    ...onChain.map((tx) => ({ kind: 'chain' as const, tx })),
    ...lightning.map((payment) => ({ kind: 'lightning' as const, payment })),
    ...arkade.map((payment) => ({ kind: 'arkade' as const, payment })),
  ]

  items.sort(compareDashboardActivityItems)

  return applyBoardingActivityLabels(items)
}
