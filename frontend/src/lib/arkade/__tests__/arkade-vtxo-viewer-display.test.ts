import { describe, expect, it } from 'vitest'
import {
  ARKADE_VTXO_VIEWER_PAGE_SIZE,
  filterArkadeVtxoRows,
  paginateArkadeVtxoRows,
  sortArkadeVtxoRows,
  vtxoRowMatchesSearch,
} from '@/lib/arkade/arkade-vtxo-viewer-display'
import type { ArkadeVtxoRowBase } from '@/workers/arkade-api'

function sampleRow(
  overrides: Partial<ArkadeVtxoRowBase> & Pick<ArkadeVtxoRowBase, 'id'>,
): ArkadeVtxoRowBase {
  return {
    amountSats: 50_000,
    createdAt: 1_700_000_000,
    expiresAt: 1_800_000_000,
    classification: 'confirmed',
    isPreconfirmed: false,
    isRecoverable: false,
    isUnrolled: false,
    isSwept: false,
    isSpent: false,
    ...overrides,
  }
}

describe('arkade-vtxo-viewer-display', () => {
  it('filter_vtxos_hide_finalized_default', () => {
    const rows = [
      sampleRow({ id: 'active:0', classification: 'confirmed' }),
      sampleRow({ id: 'done:0', classification: 'finalized', isSpent: true }),
    ]

    const filtered = filterArkadeVtxoRows(rows, {
      searchQuery: '',
      classificationFilter: null,
      hideFinalized: true,
    })

    expect(filtered).toHaveLength(1)
    expect(filtered[0]?.id).toBe('active:0')
  })

  it('filter_vtxos_search_by_id', () => {
    const rows = [
      sampleRow({ id: 'abc123def456:0' }),
      sampleRow({ id: 'other:1' }),
    ]

    expect(vtxoRowMatchesSearch(rows[0]!, 'abc123')).toBe(true)
    expect(
      filterArkadeVtxoRows(rows, {
        searchQuery: 'abc123',
        classificationFilter: null,
        hideFinalized: false,
      }),
    ).toHaveLength(1)
  })

  it('filter_vtxos_search_by_sats', () => {
    const rows = [
      sampleRow({ id: 'a:0', amountSats: 123_456 }),
      sampleRow({ id: 'b:1', amountSats: 99_000 }),
    ]

    const filtered = filterArkadeVtxoRows(rows, {
      searchQuery: '1234',
      classificationFilter: null,
      hideFinalized: false,
    })

    expect(filtered).toHaveLength(1)
    expect(filtered[0]?.amountSats).toBe(123_456)
  })

  it('filter_vtxos_classification_chip', () => {
    const rows = [
      sampleRow({ id: 'a:0', classification: 'confirmed' }),
      sampleRow({ id: 'b:1', classification: 'exiting', isUnrolled: true }),
    ]

    const filtered = filterArkadeVtxoRows(rows, {
      searchQuery: '',
      classificationFilter: 'exiting',
      hideFinalized: false,
    })

    expect(filtered).toHaveLength(1)
    expect(filtered[0]?.classification).toBe('exiting')
  })

  it('sort_vtxos_by_amount_desc', () => {
    const rows = [
      sampleRow({ id: 'low:0', amountSats: 1_000 }),
      sampleRow({ id: 'high:1', amountSats: 9_000 }),
    ]

    const sorted = sortArkadeVtxoRows(rows, 'amount_desc')
    expect(sorted.map((row) => row.id)).toEqual(['high:1', 'low:0'])
  })

  it('paginate_vtxos_page_boundary', () => {
    const rows = Array.from({ length: ARKADE_VTXO_VIEWER_PAGE_SIZE + 3 }, (_, index) =>
      sampleRow({ id: `row:${index}` }),
    )

    const pageZero = paginateArkadeVtxoRows(rows, 0, ARKADE_VTXO_VIEWER_PAGE_SIZE)
    const pageOne = paginateArkadeVtxoRows(rows, 1, ARKADE_VTXO_VIEWER_PAGE_SIZE)

    expect(pageZero).toHaveLength(ARKADE_VTXO_VIEWER_PAGE_SIZE)
    expect(pageOne).toHaveLength(3)
  })
})
