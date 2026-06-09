import { beforeEach, describe, expect, it } from 'vitest'
import {
  ensureOperatorConnectionEncrypted,
  persistSdkJsonToEncryptedPayload,
  updateOperatorSyncAtEncrypted,
} from '@/workers/arkade-worker-encrypted-payload'
import { parseWalletPayloadJson } from '@/lib/wallet/wallet-domain-types'

function emptyPayloadJson(): string {
  return JSON.stringify({
    descriptorWallets: [],
    lightningNwcConnections: [],
    arkadeOperatorConnections: [],
    activeArkadeConnectionIdByNetwork: {},
  })
}

describe('arkade-worker-encrypted-payload', () => {
  let storedPayloadJson: string
  let encryptedRoundTripJson: string

  const secretsProxy = {
    decrypt: async (_blob: unknown) => storedPayloadJson,
    encrypt: async (plaintext: string) => {
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
    writeEncryptedPayloadCAS: async () => {
      storedPayloadJson = encryptedRoundTripJson
    },
  }

  const deps = { secretsProxy, encryptedHost }

  beforeEach(() => {
    storedPayloadJson = emptyPayloadJson()
    encryptedRoundTripJson = storedPayloadJson
  })

  it('upserts operator connection and sets active id for network', async () => {
    const summary = await ensureOperatorConnectionEncrypted(
      deps,
      {
        walletId: 1,
        networkMode: 'signet',
        connectionId: 'conn-1',
        operatorSignerPkHex: '02abc',
        operatorUrl: 'https://signet.arkade.example/v1',
        delegatorUrl: 'https://delegator.example',
        sdkPersistenceJson: '{"version":3}',
      },
    )

    expect(summary.id).toBe('conn-1')
    const payload = parseWalletPayloadJson(storedPayloadJson)
    expect(payload.activeArkadeConnectionIdByNetwork.signet).toBe('conn-1')
    expect(payload.arkadeOperatorConnections[0]?.sdkPersistenceJson).toBe('{"version":3}')
  })

  it('updates operator sync timestamp without changing sdk blob', async () => {
    await ensureOperatorConnectionEncrypted(deps, {
      walletId: 1,
      networkMode: 'signet',
      connectionId: 'conn-1',
      operatorSignerPkHex: '02abc',
      operatorUrl: 'https://signet.arkade.example/v1',
      delegatorUrl: 'https://delegator.example',
      sdkPersistenceJson: '{"version":3,"wallet_db":{"offchain_next_derivation_index":2}}',
    })

    await updateOperatorSyncAtEncrypted(deps, {
      walletId: 1,
      connectionId: 'conn-1',
      lastSuccessfulOperatorSyncAt: '2020-01-03T00:00:00.000Z',
    })

    const payload = parseWalletPayloadJson(storedPayloadJson)
    expect(payload.arkadeOperatorConnections[0]?.lastSuccessfulOperatorSyncAt).toBe(
      '2020-01-03T00:00:00.000Z',
    )
    expect(payload.arkadeOperatorConnections[0]?.sdkPersistenceJson).toContain(
      'offchain_next_derivation_index',
    )
  })

  it('persistSdkJsonToEncryptedPayload merges monotonic receive cursor', async () => {
    await ensureOperatorConnectionEncrypted(deps, {
      walletId: 1,
      networkMode: 'signet',
      connectionId: 'conn-1',
      operatorSignerPkHex: '02abc',
      operatorUrl: 'https://signet.arkade.example/v1',
      delegatorUrl: 'https://delegator.example',
      sdkPersistenceJson:
        '{"version":3,"wallet_db":{"offchain_next_derivation_index":2}}',
    })

    await persistSdkJsonToEncryptedPayload(deps, {
      walletId: 1,
      connectionId: 'conn-1',
      sdkPersistenceJson:
        '{"version":3,"wallet_db":{"offchain_next_derivation_index":1}}',
    })

    const payload = parseWalletPayloadJson(storedPayloadJson)
    const sdkJson = payload.arkadeOperatorConnections[0]?.sdkPersistenceJson ?? '{}'
    expect(JSON.parse(sdkJson).wallet_db.offchain_next_derivation_index).toBe(2)
  })
})
