import { describe, expect, it } from 'vitest'
import { persistBarkProtocolState } from '@/workers/bark-worker-metadata'
import {
  BARK_MAINNET_SERVER_URL,
  BARK_SIGNET_SERVER_URL,
  parseWalletPayloadJson,
  type WalletSecretsPayload,
} from '@/lib/wallet/wallet-domain-types'
import type { EncryptedBlob } from '@/lib/shared/encrypted-blob-types'

const checkpointRecordEnvelope = 'Y2hlY2twb2ludC1kdW1w'
const syncedAt = '2020-01-01T00:00:00.000Z'
const pendingClaim = { txid: 'aa', vtxoIds: ['vtxo-1'] }

function encryptedBlob(): EncryptedBlob {
  return {
    ciphertext: new Uint8Array([1]),
    iv: new Uint8Array([2]),
    salt: new Uint8Array([3]),
    kdfPhc: 'phc',
  }
}

function signetPayload(mainnetRecordEnvelope: string, sdkPersistenceJson: string): WalletSecretsPayload {
  return {
    descriptorWallets: [],
    lightningNwcConnections: [],
    arkadeAccounts: [
      {
        id: 'acct-1',
        label: 'signet',
        networkMode: 'signet',
        operatorUrl: 'https://asp.example',
        operatorSignerPkHex: '02abc',
        createdAt: syncedAt,
        sdkPersistenceJson,
      },
    ],
    activeArkadeAccountIdByNetwork: { signet: 'acct-1' },
    barkAccounts: [
      {
        id: 'bark-signet',
        networkMode: 'signet',
        serverUrl: BARK_SIGNET_SERVER_URL,
        fingerprint: 'abcdef01',
        lastSuccessfulSyncAt: syncedAt,
        recordEnvelope: 'b2xk',
        pendingEmergencyClaim: pendingClaim,
      },
      {
        id: 'bark-mainnet',
        networkMode: 'mainnet',
        serverUrl: BARK_MAINNET_SERVER_URL,
        fingerprint: 'abcdef01',
        recordEnvelope: mainnetRecordEnvelope,
      },
    ],
  }
}

describe('persistBarkProtocolState', () => {
  it('CAS conflict re-reads and keeps the other rail and pending claim', async () => {
    const payloads = [
      signetPayload('bWFpbm5ldC12MQ==', '{"version":1}'),
      signetPayload('bWFpbm5ldC12Mg==', '{"version":2}'),
    ]
    let writtenJson = ''
    let transformRuns = 0

    await persistBarkProtocolState(
      {
        secretsProxy: {
          decrypt: async () => JSON.stringify(payloads[transformRuns - 1]),
          encrypt: async (plaintext: string) => {
            writtenJson = plaintext
            return encryptedBlob()
          },
        },
        encryptedHost: {
          readEncryptedPayload: async () => encryptedBlob(),
          updateEncryptedPayload: async (_walletId, transform) => {
            for (let attempt = 0; attempt < payloads.length; attempt += 1) {
              transformRuns += 1
              await transform(encryptedBlob())
            }
          },
        },
      },
      7,
      'signet',
      { recordEnvelope: checkpointRecordEnvelope },
    )

    expect(transformRuns).toBe(2)
    const written = parseWalletPayloadJson(writtenJson)
    const signetAcct = written.barkAccounts.find((a) => a.networkMode === 'signet')
    const mainnetAcct = written.barkAccounts.find((a) => a.networkMode === 'mainnet')
    expect(signetAcct?.recordEnvelope).toBe(checkpointRecordEnvelope)
    expect(signetAcct?.lastSuccessfulSyncAt).toBe(syncedAt)
    expect(signetAcct?.pendingEmergencyClaim).toEqual(pendingClaim)
    expect(mainnetAcct?.recordEnvelope).toBe('bWFpbm5ldC12Mg==')
    expect(written.arkadeAccounts[0]?.sdkPersistenceJson).toBe('{"version":2}')
  })
})
