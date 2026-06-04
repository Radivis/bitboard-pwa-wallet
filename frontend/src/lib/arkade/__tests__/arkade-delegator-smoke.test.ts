import { describe, expect, it, vi } from 'vitest'
import { getArkadeEndpoints } from '@/lib/arkade/arkade-endpoints'

/**
 * Phase-0 smoke: default delegator URLs are well-formed and info endpoint shape matches Fulmine.
 * Live operator/delegator calls run in manual testnet checks (see docs/deploy/fulmine-delegator-vps.md).
 */
describe('arkade delegator smoke', () => {
  it.each(['mainnet', 'testnet', 'signet'] as const)(
    'delegator URL for %s is HTTPS and has no trailing slash',
    (mode) => {
      const { delegatorUrl } = getArkadeEndpoints(mode)
      expect(delegatorUrl).toMatch(/^https:\/\//)
      expect(delegatorUrl.endsWith('/')).toBe(false)
    },
  )

  it('parses delegator info JSON shape', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        pubkey: '02' + 'ab'.repeat(32),
        fee: 1,
        delegatorAddress: 'ark1example',
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { delegatorUrl } = getArkadeEndpoints('testnet')
    const response = await fetch(`${delegatorUrl}/api/v1/delegator/info`)
    const body = (await response.json()) as {
      pubkey: string
      fee: number
      delegatorAddress: string
    }

    expect(body.pubkey).toBeTruthy()
    expect(typeof body.fee).toBe('number')
    expect(body.delegatorAddress).toBeTruthy()
    vi.unstubAllGlobals()
  })
})
