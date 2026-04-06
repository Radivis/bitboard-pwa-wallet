import { describe, expect, it } from 'vitest'
import { parseWalletSecretsJson } from '../wallet-domain-types'

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
