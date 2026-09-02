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
    expect(parsed).not.toHaveProperty('arkadeWallets')
  })

  it('strips legacy arkadeWallets key on parse', () => {
    const payload = {
      descriptorWallets: [],
      lightningNwcConnections: [],
      arkadeWallets: [
        {
          networkMode: 'signet',
          createdAt: '2020-01-01T00:00:00.000Z',
        },
      ],
    }
    const parsed = parseWalletPayloadJson(JSON.stringify(payload))
    expect(parsed).not.toHaveProperty('arkadeWallets')
    expect(parsed).not.toHaveProperty('arkadeOperatorConnections')
    expect(parsed).not.toHaveProperty('activeArkadeConnectionIdByNetwork')
    expect(parsed.arkadeAccounts).toEqual([])
    expect(parsed.activeArkadeAccountIdByNetwork).toEqual({})
  })

  it('normalizes missing arkade account fields to empty defaults', () => {
    const json = JSON.stringify({
      descriptorWallets: [],
      lightningNwcConnections: [],
    })
    const parsed = parseWalletPayloadJson(json)
    expect(parsed.arkadeAccounts).toEqual([])
    expect(parsed.activeArkadeAccountIdByNetwork).toEqual({})
  })

  const validSignetAccount = {
    id: 'acct-good',
    label: 'Mutinynet',
    networkMode: 'signet',
    operatorUrl: 'https://signet.arkade.example/v1',
    operatorSignerPkHex: '02abc',
    createdAt: '2020-01-01T00:00:00.000Z',
  }

  it('maps legacy arkadeOperatorConnections onto arkadeAccounts', () => {
    const json = JSON.stringify({
      descriptorWallets: [],
      lightningNwcConnections: [],
      arkadeOperatorConnections: [
        validSignetAccount,
      ],
      activeArkadeConnectionIdByNetwork: { signet: 'acct-good' },
    })
    const parsed = parseWalletPayloadJson(json)
    expect(parsed).not.toHaveProperty('arkadeOperatorConnections')
    expect(parsed).not.toHaveProperty('activeArkadeConnectionIdByNetwork')
    expect(parsed.arkadeAccounts).toHaveLength(1)
    expect(parsed.arkadeAccounts[0].id).toBe('acct-good')
    expect(parsed.activeArkadeAccountIdByNetwork).toEqual({ signet: 'acct-good' })
  })

  it('keeps arkadeAccounts when only the new keys are present', () => {
    const json = JSON.stringify({
      descriptorWallets: [],
      lightningNwcConnections: [],
      arkadeAccounts: [
        {
          ...validSignetAccount,
          lastSuccessfulOperatorSyncAt: '2020-01-02T00:00:00.000Z',
        },
      ],
      activeArkadeAccountIdByNetwork: { signet: 'acct-good' },
    })
    const parsed = parseWalletPayloadJson(json)
    expect(parsed.arkadeAccounts).toHaveLength(1)
    expect(parsed.activeArkadeAccountIdByNetwork.signet).toBe('acct-good')
    expect(parsed).not.toHaveProperty('arkadeOperatorConnections')
  })

  it('prefers new arkadeAccounts keys when both old and new are present', () => {
    const json = JSON.stringify({
      descriptorWallets: [],
      lightningNwcConnections: [],
      arkadeOperatorConnections: [
        { ...validSignetAccount, id: 'acct-legacy', label: 'Legacy' },
      ],
      arkadeAccounts: [validSignetAccount],
      activeArkadeConnectionIdByNetwork: { signet: 'acct-legacy' },
      activeArkadeAccountIdByNetwork: { signet: 'acct-good' },
    })
    const parsed = parseWalletPayloadJson(json)
    expect(parsed).not.toHaveProperty('arkadeOperatorConnections')
    expect(parsed).not.toHaveProperty('activeArkadeConnectionIdByNetwork')
    expect(parsed.arkadeAccounts).toHaveLength(1)
    expect(parsed.arkadeAccounts[0].id).toBe('acct-good')
    expect(parsed.activeArkadeAccountIdByNetwork).toEqual({ signet: 'acct-good' })
  })

  it('drops invalid arkadeAccounts instead of rejecting the wallet', () => {
    const json = JSON.stringify({
      descriptorWallets: [],
      lightningNwcConnections: [],
      arkadeAccounts: [
        {
          id: 'acct-bad',
          networkMode: 'signet',
        },
        validSignetAccount,
      ],
      activeArkadeAccountIdByNetwork: {
        signet: 'acct-good',
        testnet: 'acct-bad',
      },
    })
    const parsed = parseWalletPayloadJson(json)
    expect(parsed.arkadeAccounts).toHaveLength(1)
    expect(parsed.arkadeAccounts[0].id).toBe('acct-good')
    expect(parsed.activeArkadeAccountIdByNetwork).toEqual({ signet: 'acct-good' })
  })

  it('normalizes null arkadeAccounts to empty array', () => {
    const json = JSON.stringify({
      descriptorWallets: [],
      lightningNwcConnections: [],
      arkadeAccounts: null,
    })
    const parsed = parseWalletPayloadJson(json)
    expect(parsed.arkadeAccounts).toEqual([])
  })

  it('accepts arkadeAccounts and activeArkadeAccountIdByNetwork', () => {
    const json = JSON.stringify({
      descriptorWallets: [],
      lightningNwcConnections: [],
      arkadeAccounts: [
        {
          ...validSignetAccount,
          lastSuccessfulOperatorSyncAt: '2020-01-02T00:00:00.000Z',
        },
      ],
      activeArkadeAccountIdByNetwork: { signet: 'acct-good' },
    })
    const parsed = parseWalletPayloadJson(json)
    expect(parsed.arkadeAccounts).toHaveLength(1)
    expect(parsed.activeArkadeAccountIdByNetwork.signet).toBe('acct-good')
  })

  it('accepts regtest arkadeAccounts for arkade-regtest E2E', () => {
    const json = JSON.stringify({
      descriptorWallets: [],
      lightningNwcConnections: [],
      arkadeAccounts: [
        {
          id: 'acct-regtest',
          label: 'regtest',
          networkMode: 'regtest',
          operatorUrl: 'http://127.0.0.1:3100/api/arkade/operator/regtest',
          operatorSignerPkHex: 'e35799157be4b37565bb5afe4d04e6a0fa0a4b6a4f4e48b0d904685d253cdbdb',
          createdAt: '2020-01-01T00:00:00.000Z',
        },
      ],
      activeArkadeAccountIdByNetwork: { regtest: 'acct-regtest' },
    })
    const parsed = parseWalletPayloadJson(json)
    expect(parsed.arkadeAccounts).toHaveLength(1)
    expect(parsed.arkadeAccounts[0].networkMode).toBe('regtest')
    expect(parsed.activeArkadeAccountIdByNetwork.regtest).toBe('acct-regtest')
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
