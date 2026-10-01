import { describe, expect, it } from 'vitest'
import {
  applyBarkRecordDump,
  applyOpenedBarkRail,
  applySuccessfulBarkSync,
  BarkFingerprintMismatchError,
  signetRecordDumpForOpen,
} from '@/lib/bark/bark-rail-metadata'
import {
  BARK_RECORD_DUMP_MAX_BYTES,
  BARK_SIGNET_SERVER_URL,
  parseWalletPayloadJson,
  type StoredBarkRail,
  type WalletSecretsPayload,
} from '@/lib/wallet/wallet-domain-types'

const sdkPersistenceJson = '{"vtxos":[{"id":"keep-me"}]}'
const signetDump = 'c2lnbmV0LWR1bXA='
const mainnetDump = 'bWFpbm5ldC1kdW1w'

function signetRail(overrides: Partial<StoredBarkRail> = {}): StoredBarkRail {
  return {
    serverUrl: BARK_SIGNET_SERVER_URL,
    fingerprint: 'abcdef01',
    ...overrides,
  }
}

function payloadWithArkadeSdk(): WalletSecretsPayload {
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
        createdAt: '2020-01-01T00:00:00.000Z',
        sdkPersistenceJson,
      },
    ],
    activeArkadeAccountIdByNetwork: { signet: 'acct-1' },
    barkRails: {
      mainnet: {
        serverUrl: 'https://ark.example',
        fingerprint: 'abcdef01',
        recordDump: mainnetDump,
      },
    },
  }
}

describe('barkRails metadata', () => {
  it('parses a payload that has no bark rail', () => {
    const parsed = parseWalletPayloadJson(
      JSON.stringify({
        descriptorWallets: [],
        lightningNwcConnections: [],
      }),
    )
    expect(parsed.barkRails).toBeUndefined()
  })

  it('moves a legacy signet barkRail onto barkRails.signet without a dump', () => {
    const written = parseWalletPayloadJson(
      JSON.stringify({
        descriptorWallets: [],
        lightningNwcConnections: [],
        barkRail: {
          network: 'signet',
          serverUrl: BARK_SIGNET_SERVER_URL,
          fingerprint: 'abcdef01',
          lastSuccessfulSyncAt: '2020-06-01T00:00:00.000Z',
        },
      }),
    )
    expect(written.barkRails?.signet).toEqual({
      serverUrl: BARK_SIGNET_SERVER_URL,
      fingerprint: 'abcdef01',
      lastSuccessfulSyncAt: '2020-06-01T00:00:00.000Z',
    })
    expect(written.barkRails?.signet?.recordDump).toBeUndefined()
    expect(written).not.toHaveProperty('barkRail')

    const dropped = parseWalletPayloadJson(
      JSON.stringify({
        descriptorWallets: [],
        lightningNwcConnections: [],
        barkRail: { network: 'mainnet', fingerprint: 'nope' },
      }),
    )
    expect(dropped.barkRails).toBeUndefined()
    expect(dropped.arkadeAccounts).toEqual([])
  })

  it('keeps an over-cap dump and refuses to open it', () => {
    const recordDump = 'a'.repeat(BARK_RECORD_DUMP_MAX_BYTES + 1)
    const parsed = parseWalletPayloadJson(
      JSON.stringify({
        descriptorWallets: [],
        lightningNwcConnections: [],
        barkRails: {
          signet: {
            serverUrl: BARK_SIGNET_SERVER_URL,
            fingerprint: 'abcdef01',
            recordDump,
          },
        },
      }),
    )
    expect(parsed.barkRails?.signet?.recordDump).toBe(recordDump)
    expect(() => signetRecordDumpForOpen(parsed)).toThrow(
      `Bark record dump exceeds ${BARK_RECORD_DUMP_MAX_BYTES} bytes`,
    )
  })

  it('keeps sdkPersistenceJson, the mainnet dump, and refuses a different fingerprint', () => {
    const payload = payloadWithArkadeSdk()
    payload.barkRails = {
      ...payload.barkRails,
      signet: signetRail({
        lastSuccessfulSyncAt: '2020-06-01T00:00:00.000Z',
        receiveKeyIndex: 0,
        recordDump: signetDump,
      }),
    }

    const next = applyOpenedBarkRail({ payload, fingerprint: 'abcdef01' })

    expect(next.arkadeAccounts[0]?.sdkPersistenceJson).toBe(sdkPersistenceJson)
    expect(next.barkRails?.mainnet?.recordDump).toBe(mainnetDump)
    expect(next.barkRails?.signet).toEqual(
      signetRail({
        lastSuccessfulSyncAt: '2020-06-01T00:00:00.000Z',
        receiveKeyIndex: 0,
        recordDump: signetDump,
      }),
    )

    expect(() =>
      applyOpenedBarkRail({ payload, fingerprint: '00112233' }),
    ).toThrow(BarkFingerprintMismatchError)
    expect(payload.barkRails?.signet?.fingerprint).toBe('abcdef01')
  })

  it('keeps receiveKeyIndex on open and replaces it when a reveal index is passed', () => {
    const payload = payloadWithArkadeSdk()
    payload.barkRails = {
      ...payload.barkRails,
      signet: signetRail({ receiveKeyIndex: 0, recordDump: signetDump }),
    }

    const opened = applyOpenedBarkRail({ payload, fingerprint: 'abcdef01' })
    expect(opened.barkRails?.signet?.receiveKeyIndex).toBe(0)
    expect(opened.arkadeAccounts[0]?.sdkPersistenceJson).toBe(sdkPersistenceJson)
    expect(opened.barkRails?.mainnet?.recordDump).toBe(mainnetDump)

    const revealed = applyOpenedBarkRail({
      payload: opened,
      fingerprint: 'abcdef01',
      receiveKeyIndex: 2,
    })
    expect(revealed.barkRails?.signet?.receiveKeyIndex).toBe(2)
    expect(revealed.barkRails?.signet?.recordDump).toBe(signetDump)
    expect(revealed.arkadeAccounts[0]?.sdkPersistenceJson).toBe(sdkPersistenceJson)
  })

  it('stamps lastSuccessfulSyncAt and keeps the fingerprint, receive index, and Arkade payload', () => {
    const payload = payloadWithArkadeSdk()
    payload.barkRails = {
      ...payload.barkRails,
      signet: signetRail({ receiveKeyIndex: 2, recordDump: signetDump }),
    }

    const stamped = applySuccessfulBarkSync({
      payload,
      syncedAt: '2024-03-01T12:00:00.000Z',
    })

    expect(stamped.barkRails?.signet).toEqual(
      signetRail({
        receiveKeyIndex: 2,
        recordDump: signetDump,
        lastSuccessfulSyncAt: '2024-03-01T12:00:00.000Z',
      }),
    )
    expect(stamped.arkadeAccounts[0]?.sdkPersistenceJson).toBe(sdkPersistenceJson)
    expect(stamped.barkRails?.mainnet?.recordDump).toBe(mainnetDump)
    expect(payload.barkRails?.signet?.lastSuccessfulSyncAt).toBeUndefined()
  })

  it('replaces only the signet dump on a protocol flush', () => {
    const payload = payloadWithArkadeSdk()
    payload.barkRails = {
      ...payload.barkRails,
      signet: signetRail({ receiveKeyIndex: 1, recordDump: signetDump }),
    }
    const nextDump = 'bmV4dC1kdW1w'

    const flushed = applyBarkRecordDump({
      payload,
      recordDump: nextDump,
      receiveKeyIndex: 3,
    })

    expect(flushed.barkRails?.signet?.recordDump).toBe(nextDump)
    expect(flushed.barkRails?.signet?.receiveKeyIndex).toBe(3)
    expect(flushed.barkRails?.mainnet?.recordDump).toBe(mainnetDump)
    expect(flushed.arkadeAccounts[0]?.sdkPersistenceJson).toBe(sdkPersistenceJson)
    expect(payload.barkRails?.signet?.recordDump).toBe(signetDump)
  })

  it('refuses to stamp when the rail is missing or the timestamp is not ISO-8601', () => {
    const payload = payloadWithArkadeSdk()
    expect(() =>
      applySuccessfulBarkSync({ payload, syncedAt: '2024-03-01T12:00:00.000Z' }),
    ).toThrow('Bark rail is missing')

    payload.barkRails = {
      ...payload.barkRails,
      signet: signetRail({
        receiveKeyIndex: 0,
        lastSuccessfulSyncAt: '2020-06-01T00:00:00.000Z',
      }),
    }
    expect(() =>
      applySuccessfulBarkSync({ payload, syncedAt: 'not-a-timestamp' }),
    ).toThrow('Bark sync timestamp must be a parseable ISO-8601 string')
    expect(payload.barkRails?.signet?.lastSuccessfulSyncAt).toBe('2020-06-01T00:00:00.000Z')
  })

  it('drops a rail whose receiveKeyIndex is not a u32', () => {
    const dropped = parseWalletPayloadJson(
      JSON.stringify({
        descriptorWallets: [],
        lightningNwcConnections: [],
        barkRail: {
          network: 'signet',
          serverUrl: BARK_SIGNET_SERVER_URL,
          fingerprint: 'abcdef01',
          receiveKeyIndex: -1,
        },
      }),
    )
    expect(dropped.barkRails).toBeUndefined()

    const fractional = parseWalletPayloadJson(
      JSON.stringify({
        descriptorWallets: [],
        lightningNwcConnections: [],
        barkRails: {
          signet: {
            serverUrl: BARK_SIGNET_SERVER_URL,
            fingerprint: 'abcdef01',
            receiveKeyIndex: 1.5,
          },
        },
      }),
    )
    expect(fractional.barkRails).toBeUndefined()
  })
})
