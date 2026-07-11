import { format } from 'date-fns'
import type {
  ArkadeVtxoClassification,
  ArkadeVtxoRowBase,
} from '@/workers/arkade-api'

export const ARKADE_VTXO_VIEWER_PAGE_SIZE = 20

export type ArkadeVtxoSortKey =
  | 'amount_desc'
  | 'amount_asc'
  | 'expiry_asc'
  | 'expiry_desc'
  | 'created_desc'
  | 'created_asc'

export const ARKADE_VTXO_CLASSIFICATIONS: ArkadeVtxoClassification[] = [
  'pre_confirmed',
  'confirmed',
  'recoverable_settleable',
  'recoverable_pending_operator_sweep',
  'pending_recovery',
  'exiting',
  'finalized',
]

const CLASSIFICATION_LABELS: Record<ArkadeVtxoClassification, string> = {
  pre_confirmed: 'Pre-confirmed',
  confirmed: 'Confirmed',
  recoverable_settleable: 'Recoverable (ready)',
  recoverable_pending_operator_sweep: 'Recoverable (awaiting sweep)',
  pending_recovery: 'Pending recovery',
  exiting: 'Unilateral exit',
  finalized: 'Finalized',
}

export function getArkadeVtxoClassificationLabel(
  classification: ArkadeVtxoClassification,
): string {
  return CLASSIFICATION_LABELS[classification]
}

export function formatArkadeVtxoDateTime(unixSeconds: number): string {
  if (unixSeconds <= 0) {
    return '—'
  }
  return format(new Date(unixSeconds * 1000), 'yyyy-MM-dd HH:mm')
}

export type ArkadeVtxoFlagChip = 'preconfirmed' | 'recoverable' | 'unrolled' | 'swept' | 'spent'

export function getArkadeVtxoFlagChips(row: ArkadeVtxoRowBase): ArkadeVtxoFlagChip[] {
  const chips: ArkadeVtxoFlagChip[] = []
  if (row.isPreconfirmed) chips.push('preconfirmed')
  if (row.isRecoverable) chips.push('recoverable')
  if (row.isUnrolled) chips.push('unrolled')
  if (row.isSwept) chips.push('swept')
  if (row.isSpent) chips.push('spent')
  return chips
}

export function countArkadeVtxoClassifications(
  rows: ArkadeVtxoRowBase[],
): Record<ArkadeVtxoClassification, number> {
  const counts = Object.fromEntries(
    ARKADE_VTXO_CLASSIFICATIONS.map((classification) => [classification, 0]),
  ) as Record<ArkadeVtxoClassification, number>

  for (const row of rows) {
    counts[row.classification] += 1
  }
  return counts
}

export function vtxoRowMatchesSearch(row: ArkadeVtxoRowBase, searchQuery: string): boolean {
  const trimmed = searchQuery.trim()
  if (!trimmed) {
    return true
  }

  const normalizedIdQuery = trimmed.toLowerCase()
  if (row.id.toLowerCase().includes(normalizedIdQuery)) {
    return true
  }

  const digitsOnly = trimmed.replace(/\D/g, '')
  if (digitsOnly.length > 0 && String(row.amountSats).includes(digitsOnly)) {
    return true
  }

  return false
}

export interface FilterArkadeVtxoRowsOptions {
  searchQuery: string
  classificationFilter: ArkadeVtxoClassification | null
  hideFinalized: boolean
}

export function filterArkadeVtxoRows(
  rows: ArkadeVtxoRowBase[],
  options: FilterArkadeVtxoRowsOptions,
): ArkadeVtxoRowBase[] {
  return rows.filter((row) => {
    if (options.hideFinalized && row.classification === 'finalized') {
      return false
    }
    if (
      options.classificationFilter != null &&
      row.classification !== options.classificationFilter
    ) {
      return false
    }
    return vtxoRowMatchesSearch(row, options.searchQuery)
  })
}

export function sortArkadeVtxoRows(
  rows: ArkadeVtxoRowBase[],
  sortKey: ArkadeVtxoSortKey,
): ArkadeVtxoRowBase[] {
  const sorted = [...rows]
  sorted.sort((left, right) => {
    switch (sortKey) {
      case 'amount_desc':
        return right.amountSats - left.amountSats
      case 'amount_asc':
        return left.amountSats - right.amountSats
      case 'expiry_desc':
        return right.expiresAt - left.expiresAt
      case 'expiry_asc':
        return left.expiresAt - right.expiresAt
      case 'created_desc':
        return right.createdAt - left.createdAt
      case 'created_asc':
        return left.createdAt - right.createdAt
      default:
        return 0
    }
  })
  return sorted
}

export function paginateArkadeVtxoRows<T>(
  rows: T[],
  pageIndex: number,
  pageSize: number,
): T[] {
  const start = pageIndex * pageSize
  return rows.slice(start, start + pageSize)
}
