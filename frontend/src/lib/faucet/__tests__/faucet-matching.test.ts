import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  checkFaucetReachability,
  faucetsForStack,
  resolveFaucetStack,
} from '@/lib/faucet/faucet-matching'

describe('resolveFaucetStack', () => {
  it('returns mempool_testnet4 for default-style mempool testnet4 Esplora URL', () => {
    expect(
      resolveFaucetStack(
        'testnet',
        null,
        'https://mempool.space/testnet4/api',
      ),
    ).toBe('mempool_testnet4')
  })

  it('returns mempool_testnet4 when custom Esplora points at mempool testnet4', () => {
    expect(
      resolveFaucetStack(
        'testnet',
        'https://mempool.space/testnet4/api',
        'https://mempool.space/testnet4/api',
      ),
    ).toBe('mempool_testnet4')
  })

  it('returns null for testnet when Esplora host does not match curated stack', () => {
    expect(
      resolveFaucetStack(
        'testnet',
        null,
        'https://blockstream.info/testnet/api',
      ),
    ).toBeNull()
  })

  it('returns mutinynet_signet for mutinynet.com Esplora', () => {
    expect(
      resolveFaucetStack(
        'mutinynet',
        null,
        'https://mutinynet.com/api',
      ),
    ).toBe('mutinynet_signet')
  })

  it('returns mutinynet_signet when custom Esplora is mutinynet', () => {
    expect(
      resolveFaucetStack(
        'mutinynet',
        'https://mutinynet.com/api',
        'https://mutinynet.com/api',
      ),
    ).toBe('mutinynet_signet')
  })

  it('returns public_signet for default mempool signet Esplora URL', () => {
    expect(
      resolveFaucetStack(
        'signet',
        null,
        'https://mempool.space/signet/api',
      ),
    ).toBe('public_signet')
  })

  it('returns public_signet when custom Esplora points at mempool signet', () => {
    expect(
      resolveFaucetStack(
        'signet',
        'https://mempool.space/signet/api',
        'https://mempool.space/signet/api',
      ),
    ).toBe('public_signet')
  })

  it('returns public_signet when custom Esplora points at blockstream signet', () => {
    expect(
      resolveFaucetStack(
        'signet',
        'https://blockstream.info/signet/api',
        'https://blockstream.info/signet/api',
      ),
    ).toBe('public_signet')
  })

  it('returns null for signet when Esplora host does not match the public signet stack', () => {
    expect(
      resolveFaucetStack(
        'signet',
        'https://example.invalid/signet/api',
        'https://example.invalid/signet/api',
      ),
    ).toBeNull()
  })

  it('returns null for mutinynet when Esplora is public signet', () => {
    expect(
      resolveFaucetStack(
        'mutinynet',
        null,
        'https://mempool.space/signet/api',
      ),
    ).toBeNull()
  })

  it('returns null for mainnet', () => {
    expect(
      resolveFaucetStack('mainnet', null, 'https://mempool.space/api'),
    ).toBeNull()
  })
})

describe('resolveFaucetStack same-origin Esplora proxy', () => {
  it('maps localhost default API proxy testnet to mempool_testnet4', () => {
    expect(
      resolveFaucetStack(
        'testnet',
        null,
        'http://localhost:3000/api/esplora/default/testnet',
      ),
    ).toBe('mempool_testnet4')
  })

  it('maps localhost default API proxy mutinynet to mutinynet_signet', () => {
    expect(
      resolveFaucetStack(
        'mutinynet',
        null,
        'http://localhost:3000/api/esplora/default/mutinynet',
      ),
    ).toBe('mutinynet_signet')
  })

  it('maps localhost default API proxy signet to public_signet', () => {
    expect(
      resolveFaucetStack(
        'signet',
        null,
        'http://localhost:3000/api/esplora/default/signet',
      ),
    ).toBe('public_signet')
  })

  it('maps blockstream signet proxy path to public_signet', () => {
    expect(
      resolveFaucetStack(
        'signet',
        null,
        'http://localhost:3000/api/esplora/blockstream/signet',
      ),
    ).toBe('public_signet')
  })
})

describe('faucetsForStack', () => {
  it('returns only mutinynet faucet for mutinynet_signet', () => {
    const list = faucetsForStack('mutinynet_signet')
    expect(list.every((f) => f.stackId === 'mutinynet_signet')).toBe(true)
    expect(list.some((f) => f.id === 'mutinynet')).toBe(true)
  })

  it('returns the curated public signet faucets and not mutinynet', () => {
    const list = faucetsForStack('public_signet')
    expect(list.map((faucetEntry) => faucetEntry.id)).toEqual([
      'bitcoin-signet-faucet',
      'alt-signet-faucet',
      'signet-dcorral',
      'coinbin-signet',
    ])
    expect(list.some((faucetEntry) => faucetEntry.id === 'mutinynet')).toBe(false)
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
