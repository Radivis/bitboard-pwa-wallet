import { describe, expect, it } from 'vitest'
import {
  assertOperatorSignerMatches,
  buildDefaultArkadeOperatorConnection,
  defaultArkadeOperatorLabel,
  findActiveArkadeOperatorConnection,
} from '@/lib/arkade/arkade-operator-connections'
import type { WalletSecretsPayload } from '@/lib/wallet/wallet-domain-types'

const basePayload = (): WalletSecretsPayload => ({
  descriptorWallets: [],
  lightningNwcConnections: [],
  arkadeOperatorConnections: [
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
  activeArkadeConnectionIdByNetwork: { signet: 'conn-a' },
})

describe('arkade-operator-connections', () => {
  it('findActiveArkadeOperatorConnection resolves active id for network', () => {
    const connection = findActiveArkadeOperatorConnection(basePayload(), 'signet')
    expect(connection?.id).toBe('conn-a')
    expect(connection?.operatorSignerPkHex).toBe('02abc')
  })

  it('assertOperatorSignerMatches rejects cross-operator blob reuse', () => {
    const connection = basePayload().arkadeOperatorConnections[0]
    expect(() => assertOperatorSignerMatches(connection, '02other')).toThrow(
      /signer public key mismatch/,
    )
  })

  it('buildDefaultArkadeOperatorConnection carries sdkPersistenceJson', () => {
    const connection = buildDefaultArkadeOperatorConnection({
      networkMode: 'signet',
      operatorUrl: 'https://signet.arkade.example/v1',
      delegatorUrl: 'https://delegator.example',
      operatorSignerPkHex: '02abc',
      sdkPersistenceJson: '{"version":3}',
    })
    expect(connection.networkMode).toBe('signet')
    expect(connection.sdkPersistenceJson).toBe('{"version":3}')
    expect(connection.label).toBe(defaultArkadeOperatorLabel('https://signet.arkade.example/v1'))
  })
})
