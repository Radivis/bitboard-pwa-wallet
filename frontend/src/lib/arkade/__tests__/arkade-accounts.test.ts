import { describe, expect, it } from 'vitest'
import {
  assertOperatorSignerMatches,
  buildDefaultArkadeAccount,
  defaultArkadeOperatorLabel,
  findActiveArkadeAccount,
} from '@/lib/arkade/arkade-payload-merge'
import type { WalletSecretsPayload } from '@/lib/wallet/wallet-domain-types'

const basePayload = (): WalletSecretsPayload => ({
  descriptorWallets: [],
  lightningNwcConnections: [],
  arkadeAccounts: [
    {
      id: 'conn-a',
      label: 'Mutinynet',
      networkMode: 'signet',
      operatorUrl: 'https://signet.arkade.example/v1',
      operatorSignerPkHex: '02abc',
      createdAt: '2020-01-01T00:00:00.000Z',
      lastSuccessfulOperatorSyncAt: '2020-01-02T00:00:00.000Z',
    },
  ],
  activeArkadeAccountIdByNetwork: { signet: 'conn-a' },
})

describe('arkade-accounts', () => {
  it('findActiveArkadeAccount resolves active id for network', () => {
    const account = findActiveArkadeAccount(basePayload(), 'signet')
    expect(account?.id).toBe('conn-a')
    expect(account?.operatorSignerPkHex).toBe('02abc')
  })

  it('assertOperatorSignerMatches rejects cross-operator blob reuse', () => {
    const account = basePayload().arkadeAccounts[0]
    expect(() => assertOperatorSignerMatches(account, '02other')).toThrow(
      /signer public key mismatch/,
    )
  })

  it('buildDefaultArkadeAccount carries sdkPersistenceJson', () => {
    const account = buildDefaultArkadeAccount({
      networkMode: 'signet',
      operatorUrl: 'https://signet.arkade.example/v1',
      delegatorUrl: 'https://delegator.example',
      operatorSignerPkHex: '02abc',
      sdkPersistenceJson: '{"version":3}',
    })
    expect(account.networkMode).toBe('signet')
    expect(account.sdkPersistenceJson).toBe('{"version":3}')
    expect(account.label).toBe(defaultArkadeOperatorLabel('https://signet.arkade.example/v1'))
  })
})
