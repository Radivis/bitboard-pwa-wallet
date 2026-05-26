import { describe, expect, it } from 'vitest'
import { parseWalletPayloadJson, parseWalletSecretsJson } from '../wallet-domain-types'

describe('parseWalletPayloadJson', () => {
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
    const p = parseWalletPayloadJson(json)
    expect(p.descriptorWallets).toHaveLength(1)
  })

  it('accepts lightning connection with nwcSnapshot', () => {
    const t = '2025-01-01T12:00:00.000Z'
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
          createdAt: t,
          nwcSnapshot: {
            balanceSats: 1000,
            balanceUpdatedAt: t,
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
            paymentsUpdatedAt: t,
          },
        },
      ],
    })
    const p = parseWalletPayloadJson(json)
    expect(p.lightningNwcConnections[0].nwcSnapshot?.balanceSats).toBe(1000)
    expect(p.lightningNwcConnections[0].nwcSnapshot?.payments).toHaveLength(1)
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
      lightningNwcConnections: null,
    })

    expect(() => parseWalletSecretsJson(secretsJson)).toThrow(
      'Invalid wallet secrets: schema validation failed',
    )
  })
})
