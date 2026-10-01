import { describe, expect, it } from 'vitest'
import {
  applyOpenedBarkRail,
  applySuccessfulBarkSync,
  BarkFingerprintMismatchError,
} from '@/lib/bark/bark-rail-metadata'
import {
  BARK_SIGNET_SERVER_URL,
  parseWalletPayloadJson,
  type WalletSecretsPayload,
} from '@/lib/wallet/wallet-domain-types'

const sdkPersistenceJson = '{"vtxos":[{"id":"keep-me"}]}'

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
  }
}

describe('barkRail metadata', () => {
  it('parses a payload that has no barkRail', () => {
    const parsed = parseWalletPayloadJson(
      JSON.stringify({
        descriptorWallets: [],
        lightningNwcConnections: [],
      }),
    )
    expect(parsed.barkRail).toBeUndefined()
  })

  it('round-trips a written barkRail and drops an invalid one', () => {
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
    expect(written.barkRail).toEqual({
      network: 'signet',
      serverUrl: BARK_SIGNET_SERVER_URL,
      fingerprint: 'abcdef01',
      lastSuccessfulSyncAt: '2020-06-01T00:00:00.000Z',
    })

    const dropped = parseWalletPayloadJson(
      JSON.stringify({
        descriptorWallets: [],
        lightningNwcConnections: [],
        barkRail: { network: 'mainnet', fingerprint: 'nope' },
      }),
    )
    expect(dropped.barkRail).toBeUndefined()
    expect(dropped.arkadeAccounts).toEqual([])
  })

  it('keeps sdkPersistenceJson and lastSuccessfulSyncAt, and refuses a different fingerprint', () => {
    const payload = payloadWithArkadeSdk()
    payload.barkRail = {
      network: 'signet',
      serverUrl: BARK_SIGNET_SERVER_URL,
      fingerprint: 'abcdef01',
      lastSuccessfulSyncAt: '2020-06-01T00:00:00.000Z',
      receiveKeyIndex: 0,
    }

    const next = applyOpenedBarkRail({ payload, fingerprint: 'abcdef01' })

    expect(next.arkadeAccounts[0]?.sdkPersistenceJson).toBe(sdkPersistenceJson)
    expect(next.barkRail).toEqual({
      network: 'signet',
      serverUrl: BARK_SIGNET_SERVER_URL,
      fingerprint: 'abcdef01',
      lastSuccessfulSyncAt: '2020-06-01T00:00:00.000Z',
      receiveKeyIndex: 0,
    })
    expect(JSON.parse(JSON.stringify(next)).arkadeAccounts[0].sdkPersistenceJson).toBe(
      sdkPersistenceJson,
    )

    expect(() =>
      applyOpenedBarkRail({ payload, fingerprint: '00112233' }),
    ).toThrow(BarkFingerprintMismatchError)
    expect(payload.barkRail.fingerprint).toBe('abcdef01')
  })

  it('keeps receiveKeyIndex on open and replaces it when a reveal index is passed', () => {
    const payload = payloadWithArkadeSdk()
    payload.barkRail = {
      network: 'signet',
      serverUrl: BARK_SIGNET_SERVER_URL,
      fingerprint: 'abcdef01',
      receiveKeyIndex: 0,
    }

    const opened = applyOpenedBarkRail({ payload, fingerprint: 'abcdef01' })
    expect(opened.barkRail?.receiveKeyIndex).toBe(0)
    expect(opened.arkadeAccounts[0]?.sdkPersistenceJson).toBe(sdkPersistenceJson)

    const revealed = applyOpenedBarkRail({
      payload: opened,
      fingerprint: 'abcdef01',
      receiveKeyIndex: 2,
    })
    expect(revealed.barkRail?.receiveKeyIndex).toBe(2)
    expect(revealed.arkadeAccounts[0]?.sdkPersistenceJson).toBe(sdkPersistenceJson)
  })

  it('stamps lastSuccessfulSyncAt and keeps the fingerprint, receive index, and Arkade payload', () => {
    const payload = payloadWithArkadeSdk()
    payload.barkRail = {
      network: 'signet',
      serverUrl: BARK_SIGNET_SERVER_URL,
      fingerprint: 'abcdef01',
      receiveKeyIndex: 2,
    }

    const stamped = applySuccessfulBarkSync({
      payload,
      syncedAt: '2024-03-01T12:00:00.000Z',
    })

    expect(stamped.barkRail).toEqual({
      network: 'signet',
      serverUrl: BARK_SIGNET_SERVER_URL,
      fingerprint: 'abcdef01',
      receiveKeyIndex: 2,
      lastSuccessfulSyncAt: '2024-03-01T12:00:00.000Z',
    })
    expect(stamped.arkadeAccounts[0]?.sdkPersistenceJson).toBe(sdkPersistenceJson)
    expect(payload.barkRail.lastSuccessfulSyncAt).toBeUndefined()
  })

  it('refuses to stamp when the rail is missing or the timestamp is not ISO-8601', () => {
    const payload = payloadWithArkadeSdk()
    expect(() =>
      applySuccessfulBarkSync({ payload, syncedAt: '2024-03-01T12:00:00.000Z' }),
    ).toThrow('Bark rail is missing')

    payload.barkRail = {
      network: 'signet',
      serverUrl: BARK_SIGNET_SERVER_URL,
      fingerprint: 'abcdef01',
      receiveKeyIndex: 0,
      lastSuccessfulSyncAt: '2020-06-01T00:00:00.000Z',
    }
    expect(() =>
      applySuccessfulBarkSync({ payload, syncedAt: 'not-a-timestamp' }),
    ).toThrow('Bark sync timestamp must be a parseable ISO-8601 string')
    expect(payload.barkRail.lastSuccessfulSyncAt).toBe('2020-06-01T00:00:00.000Z')
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
    expect(dropped.barkRail).toBeUndefined()

    const fractional = parseWalletPayloadJson(
      JSON.stringify({
        descriptorWallets: [],
        lightningNwcConnections: [],
        barkRail: {
          network: 'signet',
          serverUrl: BARK_SIGNET_SERVER_URL,
          fingerprint: 'abcdef01',
          receiveKeyIndex: 1.5,
        },
      }),
    )
    expect(fractional.barkRail).toBeUndefined()
  })
})
