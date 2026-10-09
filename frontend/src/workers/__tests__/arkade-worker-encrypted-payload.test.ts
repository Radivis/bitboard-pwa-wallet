import { beforeEach, describe, expect, it } from 'vitest'
import {
  ensureArkadeAccountEncrypted,
  persistSdkJsonToEncryptedPayload,
  updateOperatorSyncAtEncrypted,
} from '@/workers/arkade-worker-encrypted-payload'
import { parseWalletPayloadJson } from '@/lib/wallet/wallet-domain-types'

function emptyPayloadJson(): string {
  return JSON.stringify({
    descriptorWallets: [],
    lightningNwcConnections: [],
    arkadeAccounts: [],
    activeArkadeAccountIdByNetwork: {},
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

  it('upserts Arkade account and sets active id for network', async () => {
    const summary = await ensureArkadeAccountEncrypted(
      deps,
      {
        walletId: 1,
        networkMode: 'mutinynet',
        arkadeAccountId: 'conn-1',
        operatorSignerPkHex: '02abc',
        operatorUrl: 'https://signet.arkade.example/v1',
        delegatorUrl: 'https://delegator.example',
        sdkPersistenceJson: '{"version":3}',
      },
    )

    expect(summary.id).toBe('conn-1')
    const payload = parseWalletPayloadJson(storedPayloadJson)
    expect(payload.activeArkadeAccountIdByNetwork.mutinynet).toBe('conn-1')
    expect(payload.arkadeAccounts[0]?.sdkPersistenceJson).toBe('{"version":3}')
  })

  it('updates operator sync timestamp without changing sdk blob', async () => {
    await ensureArkadeAccountEncrypted(deps, {
      walletId: 1,
      networkMode: 'mutinynet',
      arkadeAccountId: 'conn-1',
      operatorSignerPkHex: '02abc',
      operatorUrl: 'https://signet.arkade.example/v1',
      delegatorUrl: 'https://delegator.example',
      sdkPersistenceJson: '{"version":3,"wallet_db":{"offchain_next_derivation_index":2}}',
    })

    await updateOperatorSyncAtEncrypted(deps, {
      walletId: 1,
      arkadeAccountId: 'conn-1',
      lastSuccessfulOperatorSyncAt: '2020-01-03T00:00:00.000Z',
    })

    const payload = parseWalletPayloadJson(storedPayloadJson)
    expect(payload.arkadeAccounts[0]?.lastSuccessfulOperatorSyncAt).toBe(
      '2020-01-03T00:00:00.000Z',
    )
    expect(payload.arkadeAccounts[0]?.sdkPersistenceJson).toContain(
      'offchain_next_derivation_index',
    )
  })

  it('persistSdkJsonToEncryptedPayload merges monotonic receive cursor', async () => {
    await ensureArkadeAccountEncrypted(deps, {
      walletId: 1,
      networkMode: 'mutinynet',
      arkadeAccountId: 'conn-1',
      operatorSignerPkHex: '02abc',
      operatorUrl: 'https://signet.arkade.example/v1',
      delegatorUrl: 'https://delegator.example',
      sdkPersistenceJson:
        '{"version":3,"wallet_db":{"offchain_next_derivation_index":2}}',
    })

    await persistSdkJsonToEncryptedPayload(deps, {
      walletId: 1,
      arkadeAccountId: 'conn-1',
      sdkPersistenceJson:
        '{"version":3,"wallet_db":{"offchain_next_derivation_index":1}}',
    })

    const payload = parseWalletPayloadJson(storedPayloadJson)
    const sdkJson = payload.arkadeAccounts[0]?.sdkPersistenceJson ?? '{}'
    expect(JSON.parse(sdkJson).wallet_db.offchain_next_derivation_index).toBe(2)
  })

  it('persistSdkJsonToEncryptedPayload leaves bark rail dumps unchanged', async () => {
    const signetDump = 'c2lnbmV0'
    const mainnetDump = 'bWFpbg'
    storedPayloadJson = JSON.stringify({
      descriptorWallets: [],
      lightningNwcConnections: [],
      arkadeAccounts: [
        {
          id: 'conn-1',
          label: 'asp',
          networkMode: 'mutinynet',
          operatorUrl: 'https://signet.arkade.example/v1',
          operatorSignerPkHex: '02abc',
          createdAt: '2020-01-01T00:00:00.000Z',
          sdkPersistenceJson: '{"version":3}',
        },
      ],
      activeArkadeAccountIdByNetwork: { mutinynet: 'conn-1' },
      barkAccounts: [
        {
          id: 'bark-signet',
          networkMode: 'signet',
          serverUrl: 'https://ark.signet.2nd.dev',
          fingerprint: 'abcdef01',
          recordDump: signetDump,
        },
        {
          id: 'bark-mainnet',
          networkMode: 'mainnet',
          serverUrl: 'https://ark.second.tech',
          fingerprint: 'abcdef01',
          recordDump: mainnetDump,
        },
      ],
    })

    await persistSdkJsonToEncryptedPayload(deps, {
      walletId: 1,
      arkadeAccountId: 'conn-1',
      sdkPersistenceJson: '{"version":3,"wallet_db":{}}',
    })

    const payload = parseWalletPayloadJson(storedPayloadJson)
    expect(payload.barkAccounts.find((a) => a.networkMode === 'signet')?.recordDump).toBe(signetDump)
    expect(payload.barkAccounts.find((a) => a.networkMode === 'mainnet')?.recordDump).toBe(mainnetDump)
    expect(payload.arkadeAccounts[0]?.sdkPersistenceJson).toBe('{"version":3,"wallet_db":{}}')
  })
})
