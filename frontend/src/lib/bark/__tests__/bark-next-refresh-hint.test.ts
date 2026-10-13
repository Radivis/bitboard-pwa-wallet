import { format } from 'date-fns'
import { describe, expect, it } from 'vitest'
import { formatBarkNextRefreshHint } from '@/lib/bark/bark-next-refresh-hint'
import { averageBitcoinBlockSeconds } from '@/lib/bark/bark-vtxo-expiry'

const observedAt = '2026-10-10T12:00:00.000Z'

function approximateDate(blocksAhead: number, networkMode: 'signet' | 'mainnet'): string {
  const estimate = new Date(
    new Date(observedAt).getTime() + blocksAhead * averageBitcoinBlockSeconds(networkMode) * 1000,
  )
  return format(estimate, 'yyyy-MM-dd HH:mm')
}

describe('formatBarkNextRefreshHint', () => {
  it('BARK-SYNC-10 names an approximate unlock time when the refresh period is ahead', () => {
    const hint = formatBarkNextRefreshHint({
      nextRefresh: { tipHeight: 1_000, nextRefreshHeight: 1_144, observedAt },
      networkMode: 'mainnet',
    })

    const dateLabel = approximateDate(144, 'mainnet')
    expect(hint).toEqual({
      periodStarted: false,
      dateLabel,
      text:
        `Unlock this wallet around 2026-10-11 14:00 so your Bark VTXOs can be refreshed automatically.`
    })
  })

  it('uses the signet block interval for the approximate time', () => {
    const hint = formatBarkNextRefreshHint({
      nextRefresh: { tipHeight: 100, nextRefreshHeight: 112, observedAt },
      networkMode: 'signet',
    })

    expect(hint?.dateLabel).toBe(approximateDate(12, 'signet'))
  })

  it('BARK-SYNC-10 asks to stay unlocked once the refresh period has started', () => {
    for (const tipHeight of [1_144, 1_200]) {
      const hint = formatBarkNextRefreshHint({
        nextRefresh: { tipHeight, nextRefreshHeight: 1_144, observedAt },
        networkMode: 'mainnet',
      })

      expect(hint).toEqual({
        periodStarted: true,
        dateLabel: null,
        text:
          "Bark's refresh period has started. " +
          'Keep this wallet unlocked and synced until the refresh finishes.',
      })
    }
  })

  it('shows no hint without a next refresh schedule', () => {
    expect(formatBarkNextRefreshHint({ nextRefresh: null, networkMode: 'signet' })).toBeNull()
  })
})
