import { describe, expect, it, vi } from 'vitest'

/**
 * Fulmine delegator info JSON shape (when a delegator URL is configured via env).
 * Live operator/delegator calls run in manual testnet checks (see docs/deploy/fulmine-delegator-vps.md).
 */
describe('arkade delegator smoke', () => {
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

    const delegatorUrl = 'https://delegator-example.test'
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
