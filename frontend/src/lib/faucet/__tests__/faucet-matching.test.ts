import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  checkFaucetReachability,
  faucetsForNetwork,
} from '@/lib/faucet/faucet-matching'

describe('faucetsForNetwork', () => {
  it('returns curated testnet faucets for testnet', () => {
    const list = faucetsForNetwork('testnet')
    expect(list.every((faucetEntry) => faucetEntry.network === 'testnet')).toBe(true)
    expect(list.map((faucetEntry) => faucetEntry.id)).toEqual([
      'mempool-testnet4',
      'testnet4-dev',
      'coinfaucet-eu',
      'testnet4-info',
      'eternitybits',
    ])
  })

  it('returns curated public signet faucets for signet', () => {
    const list = faucetsForNetwork('signet')
    expect(list.every((faucetEntry) => faucetEntry.network === 'signet')).toBe(true)
    expect(list.map((faucetEntry) => faucetEntry.id)).toEqual([
      'bitcoin-signet-faucet',
      'alt-signet-faucet',
      'signet-dcorral',
      'coinbin-signet',
    ])
    expect(list.some((faucetEntry) => faucetEntry.id === 'mutinynet')).toBe(false)
  })

  it('returns only mutinynet faucet for mutinynet', () => {
    const list = faucetsForNetwork('mutinynet')
    expect(list.every((faucetEntry) => faucetEntry.network === 'mutinynet')).toBe(true)
    expect(list.map((faucetEntry) => faucetEntry.id)).toEqual(['mutinynet'])
  })

  it('returns an empty array for mainnet', () => {
    expect(faucetsForNetwork('mainnet')).toEqual([])
  })

  it('returns an empty array for regtest', () => {
    expect(faucetsForNetwork('regtest')).toEqual([])
  })

  it('returns an empty array for lab', () => {
    expect(faucetsForNetwork('lab')).toEqual([])
  })
})

describe('checkFaucetReachability', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns online when response is ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200 }),
    )
    const abortController = new AbortController()
    await expect(
      checkFaucetReachability('mempool-testnet4', abortController.signal),
    ).resolves.toBe('online')
  })

  it('returns offline when response is not ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 503 }),
    )
    const abortController = new AbortController()
    await expect(
      checkFaucetReachability('mempool-testnet4', abortController.signal),
    ).resolves.toBe('offline')
  })

  it('returns offline when proxy returns 502 (upstream unreachable)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 502 }),
    )
    const abortController = new AbortController()
    await expect(
      checkFaucetReachability('mempool-testnet4', abortController.signal),
    ).resolves.toBe('offline')
  })

  it('returns unknown when fetch throws (e.g. network error)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const abortController = new AbortController()
    await expect(
      checkFaucetReachability('mempool-testnet4', abortController.signal),
    ).resolves.toBe('unknown')
  })
})
