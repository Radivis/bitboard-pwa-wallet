import { describe, expect, it } from 'vitest'
import { keepBarkQueryDataForSameWallet } from '@/lib/bark/bark-wallet-queries'

describe('keepBarkQueryDataForSameWallet', () => {
  const pendingExit = [{ id: 'exit-1' }]

  it('keeps rows when the same wallet syncs again', () => {
    expect(
      keepBarkQueryDataForSameWallet(
        pendingExit,
        ['bark', 'pending-actions', 1, 'signet', '2024-03-01T12:00:00.000Z'],
        1,
        'signet',
      ),
    ).toEqual(pendingExit)
  })

  it('drops rows from a different wallet', () => {
    expect(
      keepBarkQueryDataForSameWallet(
        pendingExit,
        ['bark', 'pending-actions', 1, 'signet', '2024-03-01T12:00:00.000Z'],
        2,
        'signet',
      ),
    ).toBeUndefined()
  })

  it('drops rows from a different network', () => {
    expect(
      keepBarkQueryDataForSameWallet(
        pendingExit,
        ['bark', 'pending-actions', 1, 'signet', null],
        1,
        'mainnet',
      ),
    ).toBeUndefined()
  })
})
