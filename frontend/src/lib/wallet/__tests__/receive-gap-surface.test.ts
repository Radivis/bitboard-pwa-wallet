import { describe, expect, it } from 'vitest'
import {
  RECEIVE_GAP_HARD_MIN,
  chainHistoryObserved,
  confirmKindForGap,
  generateConfirmKindForClick,
  paymentsToAddressLabel,
  receiveGapSurface,
  softGapConfirmBody,
  unusedGapLabel,
} from '@/lib/wallet/receive-gap-surface'

const revealed = {
  revealed: true,
  index: 0,
  receiveCount: 2,
  gap: 0,
}

describe('receiveGapSurface', () => {
  it('hides the summary before a public wallet has synced', () => {
    expect(
      receiveGapSurface({
        chainObserved: false,
        reading: { ...revealed, gap: 4 },
      }),
    ).toEqual({ kind: 'hidden' })
  })

  it('hides the summary until an external address is revealed', () => {
    expect(
      receiveGapSurface({
        chainObserved: true,
        reading: { ...revealed, revealed: false },
      }),
    ).toEqual({ kind: 'hidden' })
  })

  it('shows the payment count without a gap line when the gap is under 2', () => {
    expect(
      receiveGapSurface({
        chainObserved: true,
        reading: { ...revealed, receiveCount: 0, gap: 1 },
      }),
    ).toEqual({
      kind: 'visible',
      receiveCount: 0,
      gapLabel: null,
      generateConfirm: 'soft',
    })
  })

  it('shows the gap line from 2 and the hard warning from 20', () => {
    expect(
      receiveGapSurface({
        chainObserved: true,
        reading: { ...revealed, gap: 2 },
      }).gapLabel,
    ).toBe(unusedGapLabel(2))
    expect(confirmKindForGap(19)).toBe('soft')
    expect(confirmKindForGap(20)).toBe('hard')
    expect(confirmKindForGap(0)).toBe('none')
  })

  it('formats the payment count including zero', () => {
    expect(paymentsToAddressLabel(0)).toBe('Payments to this address: 0')
  })

  it('describes the unused run the click will leave', () => {
    const lookahead = `look ahead ${RECEIVE_GAP_HARD_MIN}`
    expect(softGapConfirmBody(1)).toBe(
      `Generating another address leaves 2 unused addresses in a row. Wallets that recover from a seed ${lookahead}. You can keep sharing this one.`,
    )
    expect(softGapConfirmBody(19)).toBe(
      `Generating another address leaves ${RECEIVE_GAP_HARD_MIN} unused addresses in a row. Wallets that recover from a seed ${lookahead}. You can keep sharing this one.`,
    )
  })
})

describe('generateConfirmKindForClick', () => {
  it('asks for the hard opt-in from the local gap before chain history is in', () => {
    expect(
      generateConfirmKindForClick({
        chainObserved: false,
        reading: { ...revealed, receiveCount: 0, gap: RECEIVE_GAP_HARD_MIN },
      }),
    ).toBe('hard')
  })

  it('reveals immediately before chain history when the local gap is under 20', () => {
    expect(
      generateConfirmKindForClick({
        chainObserved: false,
        reading: { ...revealed, receiveCount: 0, gap: 4 },
      }),
    ).toBe('none')
    expect(
      generateConfirmKindForClick({
        chainObserved: false,
        reading: { ...revealed, revealed: false, gap: RECEIVE_GAP_HARD_MIN },
      }),
    ).toBe('none')
  })

  it('keeps the soft confirmation once chain history is in', () => {
    expect(
      generateConfirmKindForClick({
        chainObserved: true,
        reading: { ...revealed, receiveCount: 0, gap: 4 },
      }),
    ).toBe('soft')
    expect(
      generateConfirmKindForClick({
        chainObserved: true,
        reading: { ...revealed, gap: 0 },
      }),
    ).toBe('none')
  })
})

describe('chainHistoryObserved', () => {
  it('treats Labnet as observed without an Esplora timestamp', () => {
    expect(
      chainHistoryObserved({
        networkMode: 'lab',
        lastSyncTime: null,
      }),
    ).toBe(true)
  })

  it('requires a successful Esplora sync on a public network', () => {
    expect(
      chainHistoryObserved({
        networkMode: 'testnet',
        lastSyncTime: null,
      }),
    ).toBe(false)
    expect(
      chainHistoryObserved({
        networkMode: 'testnet',
        lastSyncTime: null,
        lastSuccessfulEsploraSyncAt: '2026-01-15T10:30:00.000Z',
      }),
    ).toBe(true)
    expect(
      chainHistoryObserved({
        networkMode: 'signet',
        lastSyncTime: new Date('2026-01-15T10:30:00.000Z'),
      }),
    ).toBe(true)
  })
})
