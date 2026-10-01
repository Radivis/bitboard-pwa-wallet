import { describe, expect, it } from 'vitest'
import {
  applyOpenedBarkRail,
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
    }

    const next = applyOpenedBarkRail({ payload, fingerprint: 'abcdef01' })

    expect(next.arkadeAccounts[0]?.sdkPersistenceJson).toBe(sdkPersistenceJson)
    expect(next.barkRail).toEqual({
      network: 'signet',
      serverUrl: BARK_SIGNET_SERVER_URL,
      fingerprint: 'abcdef01',
      lastSuccessfulSyncAt: '2020-06-01T00:00:00.000Z',
    })
    expect(JSON.parse(JSON.stringify(next)).arkadeAccounts[0].sdkPersistenceJson).toBe(
      sdkPersistenceJson,
    )

    expect(() =>
      applyOpenedBarkRail({ payload, fingerprint: '00112233' }),
    ).toThrow(BarkFingerprintMismatchError)
    expect(payload.barkRail.fingerprint).toBe('abcdef01')
  })
})
