import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  assertSdkPersistenceJsonWithinSizeLimit,
  saveSdkPersistenceJsonForNetwork,
} from '@/lib/arkade/arkade-sdk-persistence'
import { ARKADE_SDK_PERSISTENCE_JSON_MAX_BYTES } from '@/lib/arkade/arkade-sdk-persistence-types'
import { updateWalletSecretsPayloadWithRetry } from '@/db/wallet-persistence'

vi.mock('@/db/database', () => ({
  getDatabase: vi.fn(() => ({})),
}))

vi.mock('@/db/wallet-persistence', () => ({
  updateWalletSecretsPayloadWithRetry: vi.fn(),
}))

describe('arkade-sdk-persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(updateWalletSecretsPayloadWithRetry).mockResolvedValue(undefined)
  })

  it('rejects persistence JSON over size limit', () => {
    const oversized = 'x'.repeat(ARKADE_SDK_PERSISTENCE_JSON_MAX_BYTES + 1)
    expect(() => assertSdkPersistenceJsonWithinSizeLimit(oversized)).toThrow(
      /exceeds/,
    )
  })

  it('merges sdkPersistenceJson into arkadeWallets via CAS', async () => {
    const sdkPersistenceJson = JSON.stringify({ version: 1, wallet: {}, contract: {} })

    await saveSdkPersistenceJsonForNetwork({
      password: 'pw',
      walletId: 2,
      networkMode: 'signet',
      sdkPersistenceJson,
    })

    expect(updateWalletSecretsPayloadWithRetry).toHaveBeenCalledTimes(1)
    const transform = vi.mocked(updateWalletSecretsPayloadWithRetry).mock.calls[0][0]
      .transform
    const next = await transform({
      descriptorWallets: [],
      lightningNwcConnections: [],
      arkadeWallets: [
        {
          networkMode: 'signet',
          createdAt: '2020-01-01T00:00:00.000Z',
          arkadeAddress: 'tark1qexisting',
        },
      ],
    })
    expect(next.arkadeWallets).toHaveLength(1)
    expect(next.arkadeWallets[0].sdkPersistenceJson).toBe(sdkPersistenceJson)
    expect(next.arkadeWallets[0].arkadeAddress).toBe('tark1qexisting')
  })
})
