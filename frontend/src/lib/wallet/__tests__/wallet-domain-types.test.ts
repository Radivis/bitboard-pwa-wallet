import { describe, expect, it } from 'vitest'
import {
  assertIso8601LastSuccessfulEsploraSyncAt,
  parseWalletPayloadJson,
  parseWalletSecretsJson,
} from '../wallet-domain-types'

describe('parseWalletPayloadJson', () => {
  it('assertIso8601LastSuccessfulEsploraSyncAt rejects invalid timestamps', () => {
    expect(() =>
      assertIso8601LastSuccessfulEsploraSyncAt('not-a-valid-timestamp'),
    ).toThrow(/Invalid lastSuccessfulEsploraSyncAt/)
  })

  it('rejects JSON that includes a mnemonic field', () => {
    const json = JSON.stringify({
      mnemonic: 'abandon ability able about above absent absorb abstract absurd abuse access accident',
      descriptorWallets: [],
      lightningNwcConnections: [],
    })
    expect(() => parseWalletPayloadJson(json)).toThrow(
      'Invalid wallet secrets payload: schema validation failed',
    )
  })

  it('accepts payload without mnemonic', () => {
    const json = JSON.stringify({
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
    })
    const parsed = parseWalletPayloadJson(json)
    expect(parsed.descriptorWallets).toHaveLength(1)
    expect(parsed.arkadeWallets).toEqual([])
  })

  it('strips legacy arkadeSnapshot on parse', () => {
    const payload = {
      descriptorWallets: [],
      lightningNwcConnections: [],
      arkadeWallets: [
        {
          networkMode: 'signet',
          createdAt: '2020-01-01T00:00:00.000Z',
          arkadeSnapshot: {
            balance: {
              confirmedSats: 1,
              totalSats: 1,
              updatedAt: '2020-01-01T00:00:00.000Z',
            },
            payments: [],
            paymentsUpdatedAt: '2020-01-01T00:00:00.000Z',
          },
        },
      ],
    }
    const parsed = parseWalletPayloadJson(JSON.stringify(payload))
    expect(parsed.arkadeWallets[0]).not.toHaveProperty('arkadeSnapshot')
  })

  it('accepts arkade wallet with sdkPersistenceJson', () => {
    const json = JSON.stringify({ version: 1, wallet: {}, contract: {} })
    const payload = {
      descriptorWallets: [],
      lightningNwcConnections: [],
      arkadeWallets: [
        {
          networkMode: 'signet',
          createdAt: '2020-01-01T00:00:00.000Z',
          sdkPersistenceJson: json,
        },
      ],
    }
    const parsed = parseWalletPayloadJson(JSON.stringify(payload))
    expect(parsed.arkadeWallets[0].sdkPersistenceJson).toBe(json)
  })

  it('normalizes missing arkadeWallets to empty array', () => {
    const json = JSON.stringify({
      descriptorWallets: [],
      lightningNwcConnections: [],
    })
    const parsed = parseWalletPayloadJson(json)
    expect(parsed.arkadeWallets).toEqual([])
    expect(parsed.arkadeOperatorConnections).toEqual([])
    expect(parsed.activeArkadeConnectionIdByNetwork).toEqual({})
  })

  it('drops invalid arkadeOperatorConnections instead of rejecting the wallet', () => {
    const json = JSON.stringify({
      descriptorWallets: [],
      lightningNwcConnections: [],
      arkadeOperatorConnections: [
        {
          id: 'conn-bad',
          networkMode: 'signet',
        },
        {
          id: 'conn-good',
          label: 'Mutinynet',
          networkMode: 'signet',
          operatorUrl: 'https://signet.arkade.example/v1',
          operatorSignerPkHex: '02abc',
          createdAt: '2020-01-01T00:00:00.000Z',
        },
      ],
      activeArkadeConnectionIdByNetwork: {
        signet: 'conn-good',
        testnet: 'conn-bad',
      },
    })
    const parsed = parseWalletPayloadJson(json)
    expect(parsed.arkadeOperatorConnections).toHaveLength(1)
    expect(parsed.arkadeOperatorConnections[0].id).toBe('conn-good')
    expect(parsed.activeArkadeConnectionIdByNetwork).toEqual({ signet: 'conn-good' })
  })

  it('normalizes null arkadeOperatorConnections to empty array', () => {
    const json = JSON.stringify({
      descriptorWallets: [],
      lightningNwcConnections: [],
      arkadeOperatorConnections: null,
    })
    const parsed = parseWalletPayloadJson(json)
    expect(parsed.arkadeOperatorConnections).toEqual([])
  })

  it('accepts arkadeOperatorConnections and activeArkadeConnectionIdByNetwork', () => {
    const json = JSON.stringify({
      descriptorWallets: [],
      lightningNwcConnections: [],
      arkadeOperatorConnections: [
        {
          id: 'conn-1',
          label: 'Mutinynet',
          networkMode: 'signet',
          operatorUrl: 'https://signet.arkade.example/v1',
          operatorSignerPkHex: '02abc',
          createdAt: '2020-01-01T00:00:00.000Z',
          lastSuccessfulOperatorSyncAt: '2020-01-02T00:00:00.000Z',
        },
      ],
      activeArkadeConnectionIdByNetwork: { signet: 'conn-1' },
    })
    const parsed = parseWalletPayloadJson(json)
    expect(parsed.arkadeOperatorConnections).toHaveLength(1)
    expect(parsed.activeArkadeConnectionIdByNetwork.signet).toBe('conn-1')
  })

  it('accepts descriptor wallet with lastSuccessfulEsploraSyncAt', () => {
    const isoTimestamp = '2025-01-01T12:00:00.000Z'
    const json = JSON.stringify({
      descriptorWallets: [
        {
          network: 'testnet',
          addressType: 'taproot',
          accountId: 0,
          externalDescriptor: 'tr(xpub.../0/*)',
          internalDescriptor: 'tr(xpub.../1/*)',
          changeSet: '{}',
          fullScanDone: false,
          lastSuccessfulEsploraSyncAt: isoTimestamp,
        },
      ],
      lightningNwcConnections: [],
    })
    const parsed = parseWalletPayloadJson(json)
    expect(parsed.descriptorWallets[0].lastSuccessfulEsploraSyncAt).toBe(
      isoTimestamp,
    )
  })

  it('rejects descriptor wallet with invalid lastSuccessfulEsploraSyncAt', () => {
    const json = JSON.stringify({
      descriptorWallets: [
        {
          network: 'testnet',
          addressType: 'taproot',
          accountId: 0,
          externalDescriptor: 'tr(xpub.../0/*)',
          internalDescriptor: 'tr(xpub.../1/*)',
          changeSet: '{}',
          fullScanDone: false,
          lastSuccessfulEsploraSyncAt: 'not-a-valid-timestamp',
        },
      ],
      lightningNwcConnections: [],
    })
    expect(() => parseWalletPayloadJson(json)).toThrow(
      'Invalid wallet secrets payload: schema validation failed',
    )
  })

  it('accepts lightning connection with nwcSnapshot', () => {
    const isoTimestamp = '2025-01-01T12:00:00.000Z'
    const json = JSON.stringify({
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
      lightningNwcConnections: [
        {
          id: 'conn-1',
          label: 'LN',
          networkMode: 'signet',
          connectionString:
            'nostr+walletconnect://0000000000000000000000000000000000000000000000000000000000000000?relay=wss%3A%2F%2Frelay.example.com',
          createdAt: isoTimestamp,
          nwcSnapshot: {
            balanceSats: 1000,
            balanceUpdatedAt: isoTimestamp,
            payments: [
              {
                paymentHash: 'ph',
                pending: false,
                amountSats: 50,
                memo: '',
                timestamp: 1,
                bolt11: 'lnbc1fake',
                direction: 'incoming',
                feesPaidSats: 0,
              },
            ],
            paymentsUpdatedAt: isoTimestamp,
          },
        },
      ],
    })
    const parsed = parseWalletPayloadJson(json)
    expect(parsed.lightningNwcConnections[0].nwcSnapshot?.balanceSats).toBe(1000)
    expect(parsed.lightningNwcConnections[0].nwcSnapshot?.payments).toHaveLength(1)
  })
})

describe('parseWalletSecretsJson', () => {
  it('rejects malformed secrets payload before use', () => {
    const malformedSecretsJson = JSON.stringify({
      mnemonic: 'test words',
      descriptorWallets: [{ accountId: -1 }],
    })

    expect(() => parseWalletSecretsJson(malformedSecretsJson)).toThrow(
      'Invalid wallet secrets: schema validation failed',
    )
  })

  it('rejects descriptor wallet missing fullScanDone', () => {
    const secretsJson = JSON.stringify({
      mnemonic: 'abandon ability able about above absent absorb abstract absurd abuse access accident',
      descriptorWallets: [
        {
          network: 'testnet',
          addressType: 'taproot',
          accountId: 0,
          externalDescriptor: 'tr(xpub.../0/*)',
          internalDescriptor: 'tr(xpub.../1/*)',
          changeSet: '{}',
        },
      ],
    })

    expect(() => parseWalletSecretsJson(secretsJson)).toThrow(
      'Invalid wallet secrets: schema validation failed',
    )
  })

  it('accepts valid wallet secrets payload', () => {
    const validSecretsJson = JSON.stringify({
      mnemonic: 'abandon ability able about above absent absorb abstract absurd abuse access accident',
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
    })

    const parsed = parseWalletSecretsJson(validSecretsJson)
    expect(parsed.descriptorWallets).toHaveLength(1)
    expect(parsed.descriptorWallets[0].network).toBe('testnet')
    expect(parsed.lightningNwcConnections).toEqual([])
  })

  it('accepts wallet secrets with NWC connection rows', () => {
    const validSecretsJson = JSON.stringify({
      mnemonic: 'abandon ability able about above absent absorb abstract absurd abuse access accident',
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
      lightningNwcConnections: [
        {
          id: 'id1',
          label: 'Test',
          networkMode: 'signet',
          connectionString: 'nostr+walletconnect://abc?relay=wss%3A%2F%2Fx&secret=y',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    })

    const parsed = parseWalletSecretsJson(validSecretsJson)
    expect(parsed.lightningNwcConnections).toHaveLength(1)
    expect(parsed.lightningNwcConnections[0].label).toBe('Test')
  })

  it('normalizes null lightningNwcConnections to empty array', () => {
    const secretsJson = JSON.stringify({
      mnemonic: 'abandon ability able about above absent absorb abstract absurd abuse access accident',
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
      lightningNwcConnections: null,
    })

    const parsed = parseWalletSecretsJson(secretsJson)
    expect(parsed.lightningNwcConnections).toEqual([])
  })

  it('rejects lightningNwcConnections when not an array', () => {
    const secretsJson = JSON.stringify({
      mnemonic: 'abandon ability able about above absent absorb abstract absurd abuse access accident',
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
      lightningNwcConnections: 'not-an-array',
    })

    expect(() => parseWalletSecretsJson(secretsJson)).toThrow(
      'Invalid wallet secrets: schema validation failed',
    )
  })
})
