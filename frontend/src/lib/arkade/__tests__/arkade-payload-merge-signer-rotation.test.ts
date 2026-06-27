import { describe, expect, it } from 'vitest'
import {
  assertOperatorSignerMatches,
  assertOperatorSignerMatchesOrMigration,
  ensureArkadeOperatorConnectionInPayload,
} from '@/lib/arkade/arkade-payload-merge'
import type { WalletSecretsPayload } from '@/lib/wallet/wallet-domain-types'

const basePayload = (): WalletSecretsPayload => ({
  descriptorWallets: [],
  lightningNwcConnections: [],
  arkadeOperatorConnections: [],
  activeArkadeConnectionIdByNetwork: {},
})

describe('assertOperatorSignerMatchesOrMigration', () => {
  it('allows deprecated previous signer when migration hint matches', () => {
    const connection = {
      id: 'conn-1',
      label: 'test',
      networkMode: 'signet' as const,
      operatorUrl: 'https://operator.example',
      operatorSignerPkHex: '02oldsigner',
      createdAt: '2026-01-01T00:00:00.000Z',
    }

    expect(() =>
      assertOperatorSignerMatchesOrMigration(connection, '02newsigner', {
        previousSignerPkHex: '02oldsigner',
        deprecatedStatus: 'migratable',
        cutoffUnix: 4_102_444_800,
      }),
    ).not.toThrow()
  })

  it('rejects unrelated signer mismatch', () => {
    const connection = {
      id: 'conn-1',
      label: 'test',
      networkMode: 'signet' as const,
      operatorUrl: 'https://operator.example',
      operatorSignerPkHex: '02other',
      createdAt: '2026-01-01T00:00:00.000Z',
    }

    expect(() => assertOperatorSignerMatches(connection, '02newsigner')).toThrow(
      /signer public key mismatch/,
    )
  })
})

describe('ensureArkadeOperatorConnectionInPayload', () => {
  it('updates operatorSignerPkHex on migration open', () => {
    const payload = basePayload()
    payload.arkadeOperatorConnections = [
      {
        id: 'conn-1',
        label: 'test',
        networkMode: 'signet',
        operatorUrl: 'https://operator.example',
        operatorSignerPkHex: '02oldsigner',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ]
    payload.activeArkadeConnectionIdByNetwork.signet = 'conn-1'

    const { connection } = ensureArkadeOperatorConnectionInPayload(payload, {
      networkMode: 'signet',
      operatorSignerPkHex: '02newsigner',
      operatorUrl: 'https://operator.example',
      delegatorUrl: '',
      signerMigrationHint: {
        previousSignerPkHex: '02oldsigner',
        deprecatedStatus: 'migratable',
        cutoffUnix: 4_102_444_800,
      },
    })

    expect(connection.operatorSignerPkHex).toBe('02newsigner')
  })
})
