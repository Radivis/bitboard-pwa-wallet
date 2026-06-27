import { describe, expect, it } from 'vitest'
import {
  assertOperatorSignerMatches,
  assertOperatorSignerMatchesOrMigration,
  ensureArkadeOperatorConnectionInPayload,
  mergeSdkPersistenceIntoPayload,
} from '@/lib/arkade/arkade-payload-merge'
import type { ArkadeSignerMigrationHint } from '@/workers/arkade-api'
import type { WalletSecretsPayload } from '@/lib/wallet/wallet-domain-types'

const basePayload = (): WalletSecretsPayload => ({
  descriptorWallets: [],
  lightningNwcConnections: [],
  arkadeOperatorConnections: [],
  activeArkadeConnectionIdByNetwork: {},
})

const migrationHint = (
  deprecatedStatus: ArkadeSignerMigrationHint['deprecatedStatus'],
): ArkadeSignerMigrationHint => ({
  previousSignerPkHex: '02oldsigner',
  deprecatedStatus,
  cutoffUnix: 4_102_444_800,
})

const legacyConnection = {
  id: 'conn-1',
  label: 'test',
  networkMode: 'signet' as const,
  operatorUrl: 'https://operator.example',
  operatorSignerPkHex: '02oldsigner',
  createdAt: '2026-01-01T00:00:00.000Z',
}

describe('assertOperatorSignerMatchesOrMigration', () => {
  it.each(['migratable', 'due_now', 'expired'] as const)(
    'allows deprecated previous signer when migration hint matches (%s)',
    (deprecatedStatus) => {
      expect(() =>
        assertOperatorSignerMatchesOrMigration(legacyConnection, '02newsigner', {
          ...migrationHint(deprecatedStatus),
        }),
      ).not.toThrow()
    },
  )

  it('rejects unrelated signer mismatch', () => {
    const connection = {
      ...legacyConnection,
      operatorSignerPkHex: '02other',
    }

    expect(() => assertOperatorSignerMatches(connection, '02newsigner')).toThrow(
      /signer public key mismatch/,
    )
  })
})

describe('ensureArkadeOperatorConnectionInPayload', () => {
  it('updates operatorSignerPkHex on active-connection migration open', () => {
    const payload = basePayload()
    payload.arkadeOperatorConnections = [legacyConnection]
    payload.activeArkadeConnectionIdByNetwork.signet = 'conn-1'

    const { connection, payload: merged } = ensureArkadeOperatorConnectionInPayload(payload, {
      networkMode: 'signet',
      operatorSignerPkHex: '02newsigner',
      operatorUrl: 'https://operator.example',
      delegatorUrl: '',
      signerMigrationHint: migrationHint('migratable'),
    })

    expect(connection.operatorSignerPkHex).toBe('02newsigner')
    expect(connection.lastSessionOpenedAt).toMatch(/^\d{4}-/)
    expect(merged.activeArkadeConnectionIdByNetwork.signet).toBe('conn-1')
  })

  it('reactivates inactive matching connection on migration open', () => {
    const existingSdkJson =
      '{"version":3,"wallet_db":{"offchain_next_derivation_index":2}}'
    const payload = basePayload()
    payload.arkadeOperatorConnections = [
      {
        ...legacyConnection,
        sdkPersistenceJson: existingSdkJson,
      },
    ]

    const { connection, payload: merged } = ensureArkadeOperatorConnectionInPayload(payload, {
      networkMode: 'signet',
      operatorSignerPkHex: '02newsigner',
      operatorUrl: 'https://operator.example',
      delegatorUrl: '',
      signerMigrationHint: migrationHint('due_now'),
    })

    expect(connection.id).toBe('conn-1')
    expect(connection.operatorSignerPkHex).toBe('02newsigner')
    expect(connection.sdkPersistenceJson).toBe(existingSdkJson)
    expect(connection.lastSessionOpenedAt).toMatch(/^\d{4}-/)
    expect(merged.activeArkadeConnectionIdByNetwork.signet).toBe('conn-1')
  })
})

describe('post-migration persistence metadata', () => {
  it('mergeSdkPersistenceIntoPayload preserves monotonic receive cursor after signer update', () => {
    const existingSdkJson =
      '{"version":3,"wallet_db":{"offchain_next_derivation_index":2}}'
    const incomingSdkJson =
      '{"version":3,"wallet_db":{"offchain_next_derivation_index":3}}'
    const payload = basePayload()
    payload.arkadeOperatorConnections = [
      {
        ...legacyConnection,
        operatorSignerPkHex: '02newsigner',
        sdkPersistenceJson: existingSdkJson,
      },
    ]
    payload.activeArkadeConnectionIdByNetwork.signet = 'conn-1'

    const merged = mergeSdkPersistenceIntoPayload(
      payload,
      'conn-1',
      incomingSdkJson,
      '2026-06-28T12:00:00.000Z',
    )

    const connection = merged.arkadeOperatorConnections[0]
    expect(connection?.operatorSignerPkHex).toBe('02newsigner')
    expect(connection?.sdkPersistenceJson).toBe(incomingSdkJson)
    expect(connection?.lastSuccessfulOperatorSyncAt).toBe('2026-06-28T12:00:00.000Z')
  })
})
