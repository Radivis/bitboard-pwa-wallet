import { describe, expect, it } from 'vitest'
import {
  applyBarkRecordDump,
  applyOpenedBarkRail,
  applyPendingEmergencyClaim,
  applyProceedAutomatically,
  applySuccessfulBarkSync,
  BarkFingerprintMismatchError,
  signetRecordDumpForOpen,
} from '@/lib/bark/bark-rail-metadata'
import {
  BARK_MAINNET_SERVER_URL,
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
        serverUrl: BARK_MAINNET_SERVER_URL,
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

    const next = applyOpenedBarkRail({ network: 'signet', payload, fingerprint: 'abcdef01' })

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
      applyOpenedBarkRail({ network: 'signet', payload, fingerprint: '00112233' }),
    ).toThrow(BarkFingerprintMismatchError)
    expect(payload.barkRails?.signet?.fingerprint).toBe('abcdef01')
  })

  it('keeps receiveKeyIndex on open and replaces it when a reveal index is passed', () => {
    const payload = payloadWithArkadeSdk()
    payload.barkRails = {
      ...payload.barkRails,
      signet: signetRail({ receiveKeyIndex: 0, recordDump: signetDump }),
    }

    const opened = applyOpenedBarkRail({ network: 'signet', payload, fingerprint: 'abcdef01' })
    expect(opened.barkRails?.signet?.receiveKeyIndex).toBe(0)
    expect(opened.arkadeAccounts[0]?.sdkPersistenceJson).toBe(sdkPersistenceJson)
    expect(opened.barkRails?.mainnet?.recordDump).toBe(mainnetDump)

    const revealed = applyOpenedBarkRail({
      network: 'signet',
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
      network: 'signet',
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

  it('writes a mainnet open onto barkRails.mainnet and leaves the signet dump', () => {
    const payload = payloadWithArkadeSdk()
    payload.barkRails = {
      ...payload.barkRails,
      signet: signetRail({ recordDump: signetDump, receiveKeyIndex: 1 }),
    }

    const opened = applyOpenedBarkRail({
      network: 'mainnet',
      payload,
      fingerprint: 'abcdef01',
      receiveKeyIndex: 0,
      recordDump: 'bWFpbm5ldC1vcGVu',
    })

    expect(opened.barkRails?.mainnet).toEqual({
      serverUrl: BARK_MAINNET_SERVER_URL,
      fingerprint: 'abcdef01',
      receiveKeyIndex: 0,
      recordDump: 'bWFpbm5ldC1vcGVu',
    })
    expect(opened.barkRails?.signet?.recordDump).toBe(signetDump)
    expect(opened.arkadeAccounts[0]?.sdkPersistenceJson).toBe(sdkPersistenceJson)
  })

  it('replaces only the signet dump on a protocol flush', () => {
    const payload = payloadWithArkadeSdk()
    payload.barkRails = {
      ...payload.barkRails,
      signet: signetRail({ receiveKeyIndex: 1, recordDump: signetDump }),
    }
    const nextDump = 'bmV4dC1kdW1w'

    const flushed = applyBarkRecordDump({
      network: 'signet',
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
      applySuccessfulBarkSync({
        network: 'signet',
        payload,
        syncedAt: '2024-03-01T12:00:00.000Z',
      }),
    ).toThrow('Bark rail is missing')

    payload.barkRails = {
      ...payload.barkRails,
      signet: signetRail({
        receiveKeyIndex: 0,
        lastSuccessfulSyncAt: '2020-06-01T00:00:00.000Z',
      }),
    }
    expect(() =>
      applySuccessfulBarkSync({
        network: 'signet',
        payload,
        syncedAt: 'not-a-timestamp',
      }),
    ).toThrow('Bark sync timestamp must be a parseable ISO-8601 string')
    expect(payload.barkRails?.signet?.lastSuccessfulSyncAt).toBe('2020-06-01T00:00:00.000Z')
  })

  it('keeps a pending emergency claim across a sync stamp and a dump flush', () => {
    const pendingEmergencyClaim = { txid: 'claim-txid', vtxoIds: ['vtxo-1'] }
    const payload = payloadWithArkadeSdk()
    payload.barkRails = {
      ...payload.barkRails,
      signet: signetRail({
        receiveKeyIndex: 2,
        recordDump: signetDump,
        pendingEmergencyClaim,
      }),
    }

    const stamped = applySuccessfulBarkSync({
      network: 'signet',
      payload,
      syncedAt: '2024-03-01T12:00:00.000Z',
    })
    expect(stamped.barkRails?.signet?.pendingEmergencyClaim).toEqual(pendingEmergencyClaim)

    const flushed = applyBarkRecordDump({
      network: 'signet',
      payload: stamped,
      recordDump: 'bmV4dC1kdW1w',
    })
    expect(flushed.barkRails?.signet?.pendingEmergencyClaim).toEqual(pendingEmergencyClaim)
    expect(flushed.barkRails?.signet?.recordDump).toBe('bmV4dC1kdW1w')

    const cleared = applyPendingEmergencyClaim({
      payload: flushed,
      network: 'signet',
      pending: null,
    })
    expect(cleared.barkRails?.signet?.pendingEmergencyClaim).toBeUndefined()
    expect(cleared.barkRails?.signet?.recordDump).toBe('bmV4dC1kdW1w')
  })

  it('omits a malformed pending emergency claim and keeps the record dump', () => {
    const parsed = parseWalletPayloadJson(
      JSON.stringify({
        descriptorWallets: [],
        lightningNwcConnections: [],
        barkRails: {
          signet: {
            serverUrl: BARK_SIGNET_SERVER_URL,
            fingerprint: 'abcdef01',
            recordDump: signetDump,
            pendingEmergencyClaim: { txid: '', vtxoIds: [] },
          },
        },
      }),
    )
    expect(parsed.barkRails?.signet?.recordDump).toBe(signetDump)
    expect(parsed.barkRails?.signet?.pendingEmergencyClaim).toBeUndefined()
  })

  it('keeps proceed automatically across a sync stamp and a dump flush', () => {
    const payload = payloadWithArkadeSdk()
    payload.barkRails = {
      ...payload.barkRails,
      signet: signetRail({
        receiveKeyIndex: 2,
        recordDump: signetDump,
        proceedAutomatically: true,
      }),
    }

    const stamped = applySuccessfulBarkSync({
      network: 'signet',
      payload,
      syncedAt: '2024-03-01T12:00:00.000Z',
    })
    expect(stamped.barkRails?.signet?.proceedAutomatically).toBe(true)

    const flushed = applyBarkRecordDump({
      network: 'signet',
      payload: stamped,
      recordDump: 'bmV4dC1kdW1w',
    })
    expect(flushed.barkRails?.signet?.proceedAutomatically).toBe(true)
    expect(flushed.barkRails?.signet?.recordDump).toBe('bmV4dC1kdW1w')

    const turnedOff = applyProceedAutomatically({
      payload: flushed,
      network: 'signet',
      enabled: false,
    })
    expect(turnedOff.barkRails?.signet?.proceedAutomatically).toBeUndefined()
    expect(turnedOff.barkRails?.signet?.recordDump).toBe('bmV4dC1kdW1w')
  })

  it('omits a non-boolean proceed automatically flag and keeps the record dump', () => {
    const parsed = parseWalletPayloadJson(
      JSON.stringify({
        descriptorWallets: [],
        lightningNwcConnections: [],
        barkRails: {
          signet: {
            serverUrl: BARK_SIGNET_SERVER_URL,
            fingerprint: 'abcdef01',
            recordDump: signetDump,
            proceedAutomatically: 'yes',
          },
        },
      }),
    )
    expect(parsed.barkRails?.signet?.recordDump).toBe(signetDump)
    expect(parsed.barkRails?.signet?.proceedAutomatically).toBeUndefined()
  })

  it('drops a rail whose receiveKeyIndex is not a u32', () => {
    const dropped = parseWalletPayloadJson(
      JSON.stringify({
        descriptorWallets: [],
        lightningNwcConnections: [],
        barkRails: {
          signet: {
            serverUrl: BARK_SIGNET_SERVER_URL,
            fingerprint: 'abcdef01',
            receiveKeyIndex: -1,
          },
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
