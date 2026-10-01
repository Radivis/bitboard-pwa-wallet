import { describe, expect, it } from 'vitest'
import {
  BARK_VTXO_VIEWER_PAGE_SIZE,
  barkVtxoListPresentation,
  barkVtxoRowMatchesSearch,
  countBarkVtxoStates,
  filterBarkVtxoRows,
  paginateBarkVtxoRows,
  sortBarkVtxoRows,
} from '@/lib/bark/bark-vtxo-viewer-display'
import type { BarkVtxoRow } from '@/workers/bark-api'

function sampleRow(overrides: Partial<BarkVtxoRow> & Pick<BarkVtxoRow, 'id'>): BarkVtxoRow {
  return {
    amountSats: 10_000,
    expiryHeight: 100,
    state: 'spendable',
    lockHolder: null,
    registered: false,
    ...overrides,
  }
}

describe('barkVtxoListPresentation', () => {
  it('does not treat a list blocked by Bark sync as loading', () => {
    expect(
      barkVtxoListPresentation({
        syncPhase: 'syncing',
        hasData: false,
        isLoading: true,
        isError: false,
      }),
    ).toBe('waiting-for-sync')
  })

  it('shows an error instead of an empty wallet when the list fails', () => {
    expect(
      barkVtxoListPresentation({
        syncPhase: 'not-syncing',
        hasData: false,
        isLoading: false,
        isError: true,
      }),
    ).toBe('error')
  })

  it('keeps loaded rows while a later sync is running', () => {
    expect(
      barkVtxoListPresentation({
        syncPhase: 'syncing',
        hasData: true,
        isLoading: false,
        isError: false,
      }),
    ).toBe('ready')
  })
})

describe('bark-vtxo-viewer-display', () => {
  it('BARK-VTX-05 matches a partial id or a sats amount', () => {
    const rows = [
      sampleRow({ id: 'abc123def456:0', amountSats: 25_000 }),
      sampleRow({ id: 'other:1', amountSats: 10 }),
    ]

    expect(barkVtxoRowMatchesSearch(rows[0]!, 'def456')).toBe(true)
    expect(barkVtxoRowMatchesSearch(rows[1]!, 'def456')).toBe(false)
    expect(barkVtxoRowMatchesSearch(rows[0]!, '25000')).toBe(true)
    expect(barkVtxoRowMatchesSearch(rows[1]!, '25000')).toBe(false)

    const byAmount = filterBarkVtxoRows(rows, {
      searchQuery: '25,000',
      stateFilter: null,
      hideFinished: false,
    })
    expect(byAmount.map((row) => row.id)).toEqual(['abc123def456:0'])
  })

  it('keeps locked rows when spent and exited are hidden', () => {
    const filtered = filterBarkVtxoRows(
      [
        sampleRow({ id: 'lock:1', state: 'locked' }),
        sampleRow({ id: 'spent:2', state: 'spent' }),
        sampleRow({ id: 'exit:3', state: 'exited' }),
      ],
      { searchQuery: '', stateFilter: null, hideFinished: true },
    )
    expect(filtered.map((row) => row.id)).toEqual(['lock:1'])
  })

  it('counts states from the full list', () => {
    const counts = countBarkVtxoStates([
      sampleRow({ id: 'a:0', state: 'spendable' }),
      sampleRow({ id: 'b:1', state: 'spent' }),
      sampleRow({ id: 'c:2', state: 'spent' }),
    ])
    expect(counts.spendable).toBe(1)
    expect(counts.spent).toBe(2)
    expect(counts.locked).toBe(0)
    expect(counts.exited).toBe(0)
  })

  it('sorts by expiry height and amount', () => {
    const rows = [
      sampleRow({ id: 'late:0', expiryHeight: 300, amountSats: 1 }),
      sampleRow({ id: 'soon:1', expiryHeight: 100, amountSats: 9 }),
    ]
    expect(sortBarkVtxoRows(rows, 'expiry_asc').map((row) => row.id)).toEqual(['soon:1', 'late:0'])
    expect(sortBarkVtxoRows(rows, 'amount_desc').map((row) => row.id)).toEqual(['soon:1', 'late:0'])
  })

  it('pages at the viewer page size', () => {
    const rows = Array.from({ length: BARK_VTXO_VIEWER_PAGE_SIZE + 1 }, (_, index) =>
      sampleRow({ id: `row:${index}` }),
    )
    expect(paginateBarkVtxoRows(rows, 0, BARK_VTXO_VIEWER_PAGE_SIZE)).toHaveLength(
      BARK_VTXO_VIEWER_PAGE_SIZE,
    )
    expect(paginateBarkVtxoRows(rows, 1, BARK_VTXO_VIEWER_PAGE_SIZE).map((row) => row.id)).toEqual([
      `row:${BARK_VTXO_VIEWER_PAGE_SIZE}`,
    ])
  })
})
