import { barkMovementActivityLabel } from '@/lib/bark/bark-history'
import type { SyncLifecyclePhase } from '@/lib/wallet/lifecycle/rail-lifecycle-types'
import { formatSats, truncateAddress } from '@/lib/wallet/bitcoin-utils'
import type {
  BarkMovementRow,
  BarkPendingAction,
  BarkVtxoRow,
  BarkVtxoState,
} from '@/workers/bark-api'
import { BARK_VTXO_STATES } from '@/workers/bark-api'

export type BarkVtxoListPresentation = 'waiting-for-sync' | 'loading' | 'error' | 'ready'

/**
 * Bark sync holds the wallet until the server round trip finishes. A list call
 * started during that time stays pending, so the page must not treat it as loading.
 */
export function barkVtxoListPresentation(input: {
  syncPhase: SyncLifecyclePhase
  hasData: boolean
  isLoading: boolean
  isError: boolean
}): BarkVtxoListPresentation {
  if (input.syncPhase === 'syncing' && !input.hasData) return 'waiting-for-sync'
  if (input.isLoading && !input.hasData) return 'loading'
  if (input.isError && !input.hasData) return 'error'
  return 'ready'
}

export const BARK_VTXO_VIEWER_PAGE_SIZE = 20
export const EMPTY_BARK_VTXO_ROWS: BarkVtxoRow[] = []

export type BarkVtxoSortKey = 'expiry_asc' | 'expiry_desc' | 'amount_desc' | 'amount_asc'

const BARK_VTXO_STATE_LABELS: Record<BarkVtxoState, string> = {
  spendable: 'Spendable',
  locked: 'Locked',
  spent: 'Spent',
  exited: 'Exited',
}

export function getBarkVtxoStateLabel(state: BarkVtxoState): string {
  return BARK_VTXO_STATE_LABELS[state]
}

export function isFinishedBarkVtxoState(state: BarkVtxoState): boolean {
  return state === 'spent' || state === 'exited'
}

export function formatBarkVtxoLockHolderLine(
  row: BarkVtxoRow,
  pendingActions: readonly BarkPendingAction[] = [],
  movements: readonly BarkMovementRow[] = [],
): string | null {
  if (row.state !== 'locked') return null
  if (row.lockHolder == null) return 'Locked'
  if (row.lockHolder.kind === 'action') {
    const action = pendingActions.find((candidate) => candidate.id === row.lockHolder?.id)
    if (action == null) return 'Locked'
    return lockLineForPendingAction(action)
  }
  const movement = movements.find((candidate) => String(candidate.id) === row.lockHolder?.id)
  if (movement == null) return 'Locked'
  return `Locked for ${barkMovementActivityLabel(movement.subsystemName, movement.subsystemKind)}`
}

function lockLineForPendingAction(action: BarkPendingAction): string {
  const destination =
    action.destination == null ? '' : ` to ${truncateAddress(action.destination)}`
  if (action.kind === 'offboard') {
    if (action.txid != null) {
      return `Locked for Bark exit${destination}, waiting for confirmation`
    }
    return `Locked for Bark exit${destination}. ${action.status}`
  }
  return `Locked for ${action.title} of ${formatSats(action.amountSats)} sats${destination}`
}

export function countBarkVtxoStates(rows: BarkVtxoRow[]): Record<BarkVtxoState, number> {
  const counts = Object.fromEntries(
    BARK_VTXO_STATES.map((state) => [state, 0]),
  ) as Record<BarkVtxoState, number>
  for (const row of rows) {
    counts[row.state] += 1
  }
  return counts
}

export function barkVtxoRowMatchesSearch(row: BarkVtxoRow, searchQuery: string): boolean {
  const trimmed = searchQuery.trim()
  if (!trimmed) return true

  if (row.id.toLowerCase().includes(trimmed.toLowerCase())) {
    return true
  }

  const digitsOnly = trimmed.replace(/\D/g, '')
  return digitsOnly.length > 0 && String(row.amountSats).includes(digitsOnly)
}

export interface FilterBarkVtxoRowsOptions {
  searchQuery: string
  stateFilter: BarkVtxoState | null
  hideFinished: boolean
}

export function filterBarkVtxoRows(
  rows: BarkVtxoRow[],
  options: FilterBarkVtxoRowsOptions,
): BarkVtxoRow[] {
  return rows.filter((row) => {
    if (options.hideFinished && isFinishedBarkVtxoState(row.state)) {
      return false
    }
    if (options.stateFilter != null && row.state !== options.stateFilter) {
      return false
    }
    return barkVtxoRowMatchesSearch(row, options.searchQuery)
  })
}

export function sortBarkVtxoRows(rows: BarkVtxoRow[], sortKey: BarkVtxoSortKey): BarkVtxoRow[] {
  const sorted = [...rows]
  sorted.sort((left, right) => {
    switch (sortKey) {
      case 'amount_desc':
        return right.amountSats - left.amountSats
      case 'amount_asc':
        return left.amountSats - right.amountSats
      case 'expiry_desc':
        return right.expiryHeight - left.expiryHeight
      case 'expiry_asc':
        return left.expiryHeight - right.expiryHeight
    }
  })
  return sorted
}

export function paginateBarkVtxoRows<T>(rows: T[], pageIndex: number, pageSize: number): T[] {
  const start = pageIndex * pageSize
  return rows.slice(start, start + pageSize)
}
