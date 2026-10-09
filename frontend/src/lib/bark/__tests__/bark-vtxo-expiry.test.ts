import { format } from 'date-fns'
import { describe, expect, it } from 'vitest'
import {
  BITCOIN_MAINNET_AVERAGE_BLOCK_SECONDS,
  BITCOIN_SIGNET_AVERAGE_BLOCK_SECONDS,
  averageBitcoinBlockSeconds,
  formatBarkVtxoExpiry,
} from '@/lib/bark/bark-vtxo-expiry'

const now = new Date('2026-10-02T06:00:00.000Z')

function about(blocksRemaining: number, networkMode: 'signet' | 'mainnet'): string {
  const approximateExpiry = new Date(
    now.getTime() + blocksRemaining * averageBitcoinBlockSeconds(networkMode) * 1000,
  )
  return `About ${format(approximateExpiry, 'yyyy-MM-dd HH:mm')}`
}

describe('formatBarkVtxoExpiry', () => {
  it('uses a 10 minute average block on mainnet and signet', () => {
    expect(BITCOIN_MAINNET_AVERAGE_BLOCK_SECONDS).toBe(10 * 60)
    expect(BITCOIN_SIGNET_AVERAGE_BLOCK_SECONDS).toBe(10 * 60)
  })
  it('BARK-VTX-03 shows blocks remaining and an approximate mainnet date', () => {
    const expiry = formatBarkVtxoExpiry({
      expiryHeight: 250_000,
      tipHeight: 240_000,
      networkMode: 'mainnet',
      now,
    })

    expect(expiry.blocksLabel).toBe('Expires in 10000 blocks')
    expect(expiry.dateLabel).toBe(about(10_000, 'mainnet'))
    expect(expiry.blocksLabel).not.toContain('250000')
  })

  it('uses the signet average block interval for the approximate date', () => {
    const expiry = formatBarkVtxoExpiry({
      expiryHeight: 101,
      tipHeight: 100,
      networkMode: 'signet',
      now,
    })

    expect(expiry.blocksLabel).toBe('Expires in 1 block')
    expect(expiry.dateLabel).toBe(about(1, 'signet'))
  })

  it('says the coin expires at the current block', () => {
    const expiry = formatBarkVtxoExpiry({
      expiryHeight: 100,
      tipHeight: 100,
      networkMode: 'mainnet',
      now,
    })

    expect(expiry.blocksLabel).toBe('Expires at the current block')
    expect(expiry.dateLabel).toBe(about(0, 'mainnet'))
  })

  it('counts blocks already past expiry', () => {
    const expiry = formatBarkVtxoExpiry({
      expiryHeight: 90,
      tipHeight: 93,
      networkMode: 'signet',
      now,
    })

    expect(expiry.blocksLabel).toBe('Expired 3 blocks ago')
    expect(expiry.dateLabel).toBe(about(-3, 'signet'))
  })

  it('omits a date when the chain tip is unknown', () => {
    const expiry = formatBarkVtxoExpiry({
      expiryHeight: 250_000,
      tipHeight: null,
      networkMode: 'mainnet',
      now,
    })

    expect(expiry).toEqual({
      blocksLabel: 'Expiry time unavailable',
      dateLabel: null,
    })
  })
})
