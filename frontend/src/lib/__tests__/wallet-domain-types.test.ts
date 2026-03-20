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
  })
})
