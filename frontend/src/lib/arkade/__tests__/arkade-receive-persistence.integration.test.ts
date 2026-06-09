import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readOffchainNextDerivationIndex } from '@/lib/arkade/arkade-payload-merge'
import { parseWalletPayloadJson } from '@/lib/wallet/wallet-domain-types'
import { persistSdkJsonToEncryptedPayload } from '@/workers/arkade-worker-encrypted-payload'

const decryptDataMock = vi.hoisted(() => vi.fn())
const encryptDataMock = vi.hoisted(() => vi.fn())

vi.mock('@/db/encryption', () => ({
  decryptData: (...args: unknown[]) => decryptDataMock(...args),
  encryptData: (...args: unknown[]) => encryptDataMock(...args),
}))

vi.mock('@/db/wallet-persistence', () => ({
  getWalletSecretsEncrypted: vi.fn(),
  updateWalletSecretsEncryptedPayloadWithRetry: vi.fn(),
}))

const CONNECTION_ID = 'conn-receive-persist-test'
const WALLET_ID = 9
const PASSWORD = 'test-password'

function persistenceJsonWithReceiveIndex(index: number): string {
  return JSON.stringify({
    version: 3,
    wallet_db: { offchain_next_derivation_index: index },
  })
}

function emptyPayloadJson(): string {
  return JSON.stringify({
    descriptorWallets: [],
    lightningNwcConnections: [],
    arkadeOperatorConnections: [
      {
        id: CONNECTION_ID,
        label: 'signet',
        networkMode: 'signet',
        operatorUrl: 'https://signet.arkade.example/v1',
        operatorSignerPkHex: '02abc',
        createdAt: '2020-01-01T00:00:00.000Z',
      },
    ],
    activeArkadeConnectionIdByNetwork: { signet: CONNECTION_ID },
  })
}

describe('arkade receive persistence (encrypted worker path)', () => {
  let storedPayloadJson: string
  let encryptedRoundTripJson: string

  const secretsProxy = {
    decrypt: async (_password: string, _blob: unknown) => storedPayloadJson,
    encrypt: async (_password: string, plaintext: string) => {
      encryptedRoundTripJson = plaintext
      return {
        ciphertext: new Uint8Array([1]),
        iv: new Uint8Array([2]),
        salt: new Uint8Array([3]),
        kdfPhc: 'phc',
      }
    },
  }

  const encryptedHost = {
    readEncryptedPayload: async () => ({
      ciphertext: new Uint8Array([9]),
      iv: new Uint8Array([8]),
      salt: new Uint8Array([7]),
      kdfPhc: 'phc',
    }),
    writeEncryptedPayloadCAS: async (_walletId: number, _blob: unknown) => {
      storedPayloadJson = encryptedRoundTripJson
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    storedPayloadJson = emptyPayloadJson()
    encryptedRoundTripJson = storedPayloadJson
    decryptDataMock.mockReset()
    encryptDataMock.mockReset()
  })

  it('RCV-PERSIST-01 worker persist writes the revealed receive cursor without main-thread decrypt', async () => {
    await persistSdkJsonToEncryptedPayload(
      { secretsProxy, encryptedHost },
      {
        password: PASSWORD,
        walletId: WALLET_ID,
        connectionId: CONNECTION_ID,
        sdkPersistenceJson: persistenceJsonWithReceiveIndex(2),
      },
    )
    await persistSdkJsonToEncryptedPayload(
      { secretsProxy, encryptedHost },
      {
        password: PASSWORD,
        walletId: WALLET_ID,
        connectionId: CONNECTION_ID,
        sdkPersistenceJson: persistenceJsonWithReceiveIndex(2),
      },
    )

    const payload = parseWalletPayloadJson(storedPayloadJson)
    const sdkJson = payload.arkadeOperatorConnections[0]?.sdkPersistenceJson

    expect(readOffchainNextDerivationIndex(sdkJson)).toBe(2)
    expect(decryptDataMock).not.toHaveBeenCalled()
  })

  it('RCV-PERSIST-02 stale lower-index flush cannot regress a newer receive cursor', async () => {
    await persistSdkJsonToEncryptedPayload(
      { secretsProxy, encryptedHost },
      {
        password: PASSWORD,
        walletId: WALLET_ID,
        connectionId: CONNECTION_ID,
        sdkPersistenceJson: persistenceJsonWithReceiveIndex(2),
      },
    )

    await persistSdkJsonToEncryptedPayload(
      { secretsProxy, encryptedHost },
      {
        password: PASSWORD,
        walletId: WALLET_ID,
        connectionId: CONNECTION_ID,
        sdkPersistenceJson: persistenceJsonWithReceiveIndex(1),
      },
    )

    const payload = parseWalletPayloadJson(storedPayloadJson)
    expect(
      readOffchainNextDerivationIndex(payload.arkadeOperatorConnections[0]?.sdkPersistenceJson),
    ).toBe(2)
  })
})
