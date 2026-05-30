import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WalletSecretsPayload } from '@/lib/wallet/wallet-domain-types'
import { updateWalletSecretsPayloadWithRetry } from '@/db/wallet-persistence'

vi.mock('@/db/database', () => ({
  getDatabase: vi.fn(() => ({})),
}))

vi.mock('@/db/wallet-persistence', () => ({
  loadWalletSecretsPayload: vi.fn(),
  updateWalletSecretsPayloadWithRetry: vi.fn(),
}))

import {
  applyLastSuccessfulEsploraSyncAtToPayload,
  persistLastSuccessfulEsploraSyncAt,
} from '@/lib/wallet/onchain-esplora-sync-metadata'

function buildPayload(): WalletSecretsPayload {
  return {
    descriptorWallets: [
      {
        network: 'testnet',
        addressType: 'taproot',
        accountId: 0,
        externalDescriptor: 'tr(xpub.../0/*)',
        internalDescriptor: 'tr(xpub.../1/*)',
        changeSet: '{}',
        fullScanDone: false,
      },
    ],
    lightningNwcConnections: [],
  }
}

describe('onchain-esplora-sync-metadata', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('applyLastSuccessfulEsploraSyncAtToPayload sets timestamp on matching sub-wallet', () => {
    const syncedAtIso = '2025-06-01T12:00:00.000Z'
    const patched = applyLastSuccessfulEsploraSyncAtToPayload(buildPayload(), {
      network: 'testnet',
      addressType: 'taproot',
      accountId: 0,
      syncedAtIso,
    })
    expect(patched.descriptorWallets[0].lastSuccessfulEsploraSyncAt).toBe(
      syncedAtIso,
    )
  })

  it('persistLastSuccessfulEsploraSyncAt delegates to CAS helper', async () => {
    vi.mocked(updateWalletSecretsPayloadWithRetry).mockResolvedValue(undefined)

    await persistLastSuccessfulEsploraSyncAt({
      password: 'pw',
      walletId: 1,
      network: 'testnet',
      addressType: 'taproot',
      accountId: 0,
      syncedAtIso: '2025-06-01T12:00:00.000Z',
    })

    expect(updateWalletSecretsPayloadWithRetry).toHaveBeenCalledTimes(1)
  })
})
