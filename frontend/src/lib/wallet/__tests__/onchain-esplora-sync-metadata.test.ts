import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WalletSecretsPayload } from '@/lib/wallet/wallet-domain-types'
import { updateWalletSecretsPayloadWithRetry } from '@/db/wallet-persistence'

const readLastSuccessfulEsploraSyncAtForDescriptorWallet = vi.fn()

vi.mock('@/db/database', () => ({
  ensureMigrated: vi.fn(async () => undefined),
  getDatabase: vi.fn(() => ({})),
}))

vi.mock('@/workers/secrets-channel', () => ({
  ensureSecretsChannel: vi.fn(async () => undefined),
}))

vi.mock('@/stores/cryptoStore', () => ({
  useCryptoStore: {
    getState: () => ({
      readLastSuccessfulEsploraSyncAtForDescriptorWallet,
    }),
  },
}))

vi.mock('@/db/wallet-persistence', () => ({
  getWalletSecretsEncrypted: vi.fn(),
  updateWalletSecretsPayloadWithRetry: vi.fn(),
}))

import { getWalletSecretsEncrypted } from '@/db/wallet-persistence'
import {
  applyLastSuccessfulEsploraSyncAtToPayload,
  loadLastSuccessfulEsploraSyncAtForDescriptorWallet,
  persistLastSuccessfulEsploraSyncAt,
} from '@/lib/wallet/onchain-esplora-sync-metadata'

const encryptedPayloadBlob = {
  ciphertext: new Uint8Array([1]),
  iv: new Uint8Array([2]),
  salt: new Uint8Array([3]),
  kdfPhc: 'argon2id',
}

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
    vi.mocked(getWalletSecretsEncrypted).mockResolvedValue({
      payload: encryptedPayloadBlob,
      mnemonic: encryptedPayloadBlob,
    })
  })

  it('applyLastSuccessfulEsploraSyncAtToPayload sets timestamp on matching descriptor wallet', () => {
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
      walletId: 1,
      network: 'testnet',
      addressType: 'taproot',
      accountId: 0,
      syncedAtIso: '2025-06-01T12:00:00.000Z',
    })

    expect(updateWalletSecretsPayloadWithRetry).toHaveBeenCalledTimes(1)
  })

  it('applyLastSuccessfulEsploraSyncAtToPayload rejects invalid syncedAtIso', () => {
    expect(() =>
      applyLastSuccessfulEsploraSyncAtToPayload(buildPayload(), {
        network: 'testnet',
        addressType: 'taproot',
        accountId: 0,
        syncedAtIso: 'not-a-valid-timestamp',
      }),
    ).toThrow(/Invalid lastSuccessfulEsploraSyncAt/)
  })

  it('loadLastSuccessfulEsploraSyncAtForDescriptorWallet reads timestamp via crypto worker', async () => {
    const isoTimestamp = '2025-06-01T12:00:00.000Z'
    readLastSuccessfulEsploraSyncAtForDescriptorWallet.mockResolvedValue(
      isoTimestamp,
    )

    const result = await loadLastSuccessfulEsploraSyncAtForDescriptorWallet({
      walletId: 1,
      network: 'testnet',
      addressType: 'taproot',
      accountId: 0,
    })

    expect(getWalletSecretsEncrypted).toHaveBeenCalledWith({}, 1)
    expect(readLastSuccessfulEsploraSyncAtForDescriptorWallet).toHaveBeenCalledWith({
      encryptedPayload: encryptedPayloadBlob,
      network: 'testnet',
      addressType: 'taproot',
      accountId: 0,
    })
    expect(result).toBe(isoTimestamp)
  })
})
