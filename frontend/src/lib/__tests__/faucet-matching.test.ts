import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  checkFaucetReachability,
  faucetsForStack,
  resolveFaucetStack,
} from '@/lib/faucet-matching'

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
        'signet',
        null,
        'https://mutinynet.com/api',
      ),
    ).toBe('mutinynet_signet')
  })

  it('returns mutinynet_signet when custom Esplora is mutinynet', () => {
    expect(
      resolveFaucetStack(
        'signet',
        'https://mutinynet.com/api',
        'https://mutinynet.com/api',
      ),
    ).toBe('mutinynet_signet')
  })

  it('returns null for signet when Esplora is not mutinynet', () => {
    expect(
      resolveFaucetStack(
        'signet',
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

describe('resolveFaucetStack DEV Esplora proxy', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('maps localhost esplora-proxy testnet to mempool_testnet4 when DEV', () => {
    vi.stubEnv('DEV', true)
    expect(
      resolveFaucetStack(
        'testnet',
        null,
        'http://localhost:3000/esplora-proxy/testnet',
      ),
    ).toBe('mempool_testnet4')
  })

  it('maps localhost esplora-proxy signet to mutinynet_signet when DEV', () => {
    vi.stubEnv('DEV', true)
    expect(
      resolveFaucetStack(
        'signet',
        null,
        'http://localhost:3000/esplora-proxy/signet',
      ),
    ).toBe('mutinynet_signet')
  })
})

describe('faucetsForStack', () => {
  it('returns only mutinynet faucet for mutinynet_signet', () => {
    const list = faucetsForStack('mutinynet_signet')
    expect(list.every((f) => f.stackId === 'mutinynet_signet')).toBe(true)
    expect(list.some((f) => f.id === 'mutinynet')).toBe(true)
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
    const c = new AbortController()
    await expect(
      checkFaucetReachability('https://example.com/', c.signal),
    ).resolves.toBe('online')
  })

  it('returns offline when response is not ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 503 }),
    )
    const c = new AbortController()
    await expect(
      checkFaucetReachability('https://example.com/', c.signal),
    ).resolves.toBe('offline')
  })

  it('returns unknown when fetch throws (e.g. CORS)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const c = new AbortController()
    await expect(
      checkFaucetReachability('https://example.com/', c.signal),
    ).resolves.toBe('unknown')
  })
})
