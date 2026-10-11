import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from '@/db/schema'
import { createTestDatabase } from '@/db/test-helpers'
import type { EncryptedBlob } from '@/lib/shared/encrypted-blob-types'

const testDatabaseRef = vi.hoisted(() => ({ current: null as unknown }))

vi.mock('@/db/database', () => ({
  getDatabase: () => testDatabaseRef.current,
}))

vi.mock('@/workers/encryption-factory', async () => {
  const { getMockEncryptionWorker } = await import('@/db/__tests__/mock-encryption-worker')
  return {
    getEncryptionWorker: () => getMockEncryptionWorker(),
  }
})

import {
  getWalletSecretsEncrypted,
  putSplitWalletSecretsEncrypted,
} from '@/db/wallet-persistence'
import { createEncryptedWalletSecretsHost } from '@/lib/wallet/encrypted-wallet-secrets-host'
import {
  BARK_SIGNET_SERVER_URL,
  parseWalletPayloadJson,
  type WalletSecretsPayload,
} from '@/lib/wallet/wallet-domain-types'
import { persistSdkJsonToEncryptedPayload } from '@/workers/arkade-worker-encrypted-payload'
import {
  persistBarkProtocolState,
  writePendingEmergencyClaim,
} from '@/workers/bark-worker-metadata'

const ARKADE_ACCOUNT_ID = 'arkade-signet'
const INITIAL_SDK_JSON = '{"version":3}'
const NEXT_SDK_JSON = '{"version":3,"wallet_db":{}}'
const INITIAL_BARK_DUMP = 'b2xkLWR1bXA='
const NEXT_BARK_DUMP = 'bmV4dC1kdW1w'
const PENDING_CLAIM = { txid: 'aa', vtxoIds: ['vtxo-1'] }
const CONCURRENT_WRITE_GRACE_MS = 20

function fakeEncrypt(plaintext: string): EncryptedBlob {
  return {
    ciphertext: new TextEncoder().encode(plaintext),
    iv: new Uint8Array([1]),
    salt: new Uint8Array([2]),
    kdfPhc: 'test-phc',
  }
}

function fakeDecrypt(blob: EncryptedBlob): string {
  return new TextDecoder().decode(blob.ciphertext)
}

const plainSecretsProxy = {
  decrypt: async (blob: EncryptedBlob) => fakeDecrypt(blob),
  encrypt: async (plaintext: string) => fakeEncrypt(plaintext),
}

function waitMilliseconds(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function initialSignetPayload(): WalletSecretsPayload {
  return {
    descriptorWallets: [],
    lightningNwcConnections: [],
    arkadeAccounts: [
      {
        id: ARKADE_ACCOUNT_ID,
        label: 'signet',
        networkMode: 'signet',
        operatorUrl: 'https://signet.arkade.sh',
        operatorSignerPkHex: '02abc',
        createdAt: '2020-01-01T00:00:00.000Z',
        sdkPersistenceJson: INITIAL_SDK_JSON,
      },
    ],
    activeArkadeAccountIdByNetwork: { signet: ARKADE_ACCOUNT_ID },
    barkAccounts: [
      {
        id: 'bark-signet',
        networkMode: 'signet',
        serverUrl: BARK_SIGNET_SERVER_URL,
        fingerprint: 'abcdef01',
        recordEnvelope: INITIAL_BARK_DUMP,
      },
    ],
  }
}

/**
 * Secrets proxy whose first decrypt starts `concurrentWrite` and gives it a short head
 * start, like a Bark checkpoint landing while another writer is still merging.
 */
function interleaveOnFirstDecrypt(concurrentWrite: () => Promise<void>) {
  let concurrentWritePromise: Promise<void> | null = null
  const secretsProxy = {
    async decrypt(blob: EncryptedBlob) {
      if (concurrentWritePromise == null) {
        concurrentWritePromise = concurrentWrite()
        await Promise.race([
          concurrentWritePromise.catch(() => undefined),
          waitMilliseconds(CONCURRENT_WRITE_GRACE_MS),
        ])
      }
      return fakeDecrypt(blob)
    },
    encrypt: plainSecretsProxy.encrypt,
  }
  return {
    secretsProxy,
    awaitConcurrentWrite: () => concurrentWritePromise ?? Promise.resolve(),
  }
}

describe('encrypted wallet secrets host (real SQLite)', () => {
  let walletDb: Kysely<Database>
  let walletId: number

  async function readStoredPayload(): Promise<WalletSecretsPayload> {
    const encrypted = await getWalletSecretsEncrypted(walletDb, walletId)
    return parseWalletPayloadJson(fakeDecrypt(encrypted.payload))
  }

  function signetBarkDump(payload: WalletSecretsPayload): string | undefined {
    return payload.barkAccounts.find((account) => account.networkMode === 'signet')?.recordEnvelope
  }

  beforeEach(async () => {
    walletDb = await createTestDatabase()
    testDatabaseRef.current = walletDb
    const walletInsert = await walletDb
      .insertInto('wallets')
      .values({ name: 'Signet wallet', created_at: new Date().toISOString() })
      .executeTakeFirstOrThrow()
    walletId = Number(walletInsert.insertId)
    await putSplitWalletSecretsEncrypted(walletDb, walletId, {
      payload: fakeEncrypt(JSON.stringify(initialSignetPayload())),
      mnemonic: fakeEncrypt('test mnemonic'),
    })
  })

  afterEach(async () => {
    testDatabaseRef.current = null
    await walletDb.destroy()
  })

  it('updateEncryptedPayload re-runs the transform on the newer blob after a revision conflict', async () => {
    const host = createEncryptedWalletSecretsHost()
    const barkDumpsSeen: Array<string | undefined> = []

    await host.updateEncryptedPayload(walletId, async (currentBlob) => {
      const currentPayload = parseWalletPayloadJson(fakeDecrypt(currentBlob))
      barkDumpsSeen.push(signetBarkDump(currentPayload))
      if (barkDumpsSeen.length === 1) {
        const otherTabPayload: WalletSecretsPayload = {
          ...currentPayload,
          barkAccounts: currentPayload.barkAccounts.map((account) => ({
            ...account,
            recordEnvelope: NEXT_BARK_DUMP,
          })),
        }
        await putSplitWalletSecretsEncrypted(walletDb, walletId, {
          payload: fakeEncrypt(JSON.stringify(otherTabPayload)),
        })
      }
      const nextPayload: WalletSecretsPayload = {
        ...currentPayload,
        arkadeAccounts: currentPayload.arkadeAccounts.map((account) => ({
          ...account,
          sdkPersistenceJson: NEXT_SDK_JSON,
        })),
      }
      return fakeEncrypt(JSON.stringify(nextPayload))
    })

    expect(barkDumpsSeen).toEqual([INITIAL_BARK_DUMP, NEXT_BARK_DUMP])
    const stored = await readStoredPayload()
    expect(signetBarkDump(stored)).toBe(NEXT_BARK_DUMP)
    expect(stored.arkadeAccounts[0]?.sdkPersistenceJson).toBe(NEXT_SDK_JSON)
  })

  it('updateEncryptedPayload rejects and frees the queue when the worker host is detached mid-transform', async () => {
    const detachController = new AbortController()
    const detachableHost = createEncryptedWalletSecretsHost({
      detachSignal: detachController.signal,
    })
    const stalledUpdate = detachableHost.updateEncryptedPayload(
      walletId,
      () => new Promise<EncryptedBlob>(() => undefined),
    )
    await waitMilliseconds(CONCURRENT_WRITE_GRACE_MS)

    detachController.abort()

    await expect(stalledUpdate).rejects.toThrow(/detached/i)
    const host = createEncryptedWalletSecretsHost()
    await expect(
      host.updateEncryptedPayload(walletId, async (currentBlob) => currentBlob),
    ).resolves.toBeUndefined()
  })

  it('Arkade SDK persist keeps a Bark checkpoint committed while Arkade was merging', async () => {
    const host = createEncryptedWalletSecretsHost()
    const barkDeps = { secretsProxy: plainSecretsProxy, encryptedHost: host }
    const interleaving = interleaveOnFirstDecrypt(() =>
      persistBarkProtocolState(barkDeps, walletId, 'signet', { recordEnvelope: NEXT_BARK_DUMP }),
    )

    await persistSdkJsonToEncryptedPayload(
      { secretsProxy: interleaving.secretsProxy, encryptedHost: host },
      {
        walletId,
        arkadeAccountId: ARKADE_ACCOUNT_ID,
        sdkPersistenceJson: NEXT_SDK_JSON,
      },
    )
    await interleaving.awaitConcurrentWrite()

    const stored = await readStoredPayload()
    expect(signetBarkDump(stored)).toBe(NEXT_BARK_DUMP)
    expect(stored.arkadeAccounts[0]?.sdkPersistenceJson).toBe(NEXT_SDK_JSON)
  })

  it('Bark pending-claim write keeps an Arkade SDK update committed while Bark was merging', async () => {
    const host = createEncryptedWalletSecretsHost()
    const arkadeDeps = { secretsProxy: plainSecretsProxy, encryptedHost: host }
    const interleaving = interleaveOnFirstDecrypt(() =>
      persistSdkJsonToEncryptedPayload(arkadeDeps, {
        walletId,
        arkadeAccountId: ARKADE_ACCOUNT_ID,
        sdkPersistenceJson: NEXT_SDK_JSON,
      }),
    )

    await writePendingEmergencyClaim(
      { secretsProxy: interleaving.secretsProxy, encryptedHost: host },
      walletId,
      'signet',
      PENDING_CLAIM,
    )
    await interleaving.awaitConcurrentWrite()

    const stored = await readStoredPayload()
    expect(stored.arkadeAccounts[0]?.sdkPersistenceJson).toBe(NEXT_SDK_JSON)
    expect(
      stored.barkAccounts.find((account) => account.networkMode === 'signet')
        ?.pendingEmergencyClaim,
    ).toEqual(PENDING_CLAIM)
  })
})
