import { describe, expect, it } from 'vitest'
import {
  assertOperatorSignerMatches,
  assertOperatorSignerMatchesOrMigration,
  ensureArkadeAccountInPayload,
  mergeSdkPersistenceIntoPayload,
} from '@/lib/arkade/arkade-payload-merge'
import type { ArkadeSignerMigrationHint } from '@/workers/arkade-api'
import type { WalletSecretsPayload } from '@/lib/wallet/wallet-domain-types'

const basePayload = (): WalletSecretsPayload => ({
  descriptorWallets: [],
  lightningNwcConnections: [],
  arkadeAccounts: [],
  activeArkadeAccountIdByNetwork: {},
})

const migrationHint = (
  deprecatedStatus: ArkadeSignerMigrationHint['deprecatedStatus'],
): ArkadeSignerMigrationHint => ({
  previousSignerPkHex: '02oldsigner',
  deprecatedStatus,
  cutoffUnix: 4_102_444_800,
})

const legacyAccount = {
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
        assertOperatorSignerMatchesOrMigration(legacyAccount, '02newsigner', {
          ...migrationHint(deprecatedStatus),
        }),
      ).not.toThrow()
    },
  )

  it('rejects unrelated signer mismatch', () => {
    const account = {
      ...legacyAccount,
      operatorSignerPkHex: '02other',
    }

    expect(() => assertOperatorSignerMatches(account, '02newsigner')).toThrow(
      /signer public key mismatch/,
    )
  })
})

describe('ensureArkadeAccountInPayload', () => {
  it('updates operatorSignerPkHex on active-account migration open', () => {
    const payload = basePayload()
    payload.arkadeAccounts = [legacyAccount]
    payload.activeArkadeAccountIdByNetwork.signet = 'conn-1'

    const { account, payload: merged } = ensureArkadeAccountInPayload(payload, {
      networkMode: 'signet',
      operatorSignerPkHex: '02newsigner',
      operatorUrl: 'https://operator.example',
      delegatorUrl: '',
      signerMigrationHint: migrationHint('migratable'),
    })

    expect(account.operatorSignerPkHex).toBe('02newsigner')
    expect(account.lastSessionOpenedAt).toMatch(/^\d{4}-/)
    expect(merged.activeArkadeAccountIdByNetwork.signet).toBe('conn-1')
  })

  it('reactivates inactive matching account on migration open', () => {
    const existingSdkJson =
      '{"version":3,"wallet_db":{"offchain_next_derivation_index":2}}'
    const payload = basePayload()
    payload.arkadeAccounts = [
      {
        ...legacyAccount,
        sdkPersistenceJson: existingSdkJson,
      },
    ]

    const { account, payload: merged } = ensureArkadeAccountInPayload(payload, {
      networkMode: 'signet',
      operatorSignerPkHex: '02newsigner',
      operatorUrl: 'https://operator.example',
      delegatorUrl: '',
      signerMigrationHint: migrationHint('due_now'),
    })

    expect(account.id).toBe('conn-1')
    expect(account.operatorSignerPkHex).toBe('02newsigner')
    expect(account.sdkPersistenceJson).toBe(existingSdkJson)
    expect(account.lastSessionOpenedAt).toMatch(/^\d{4}-/)
    expect(merged.activeArkadeAccountIdByNetwork.signet).toBe('conn-1')
  })
})

describe('post-migration persistence metadata', () => {
  it('mergeSdkPersistenceIntoPayload preserves monotonic receive cursor after signer update', () => {
    const existingSdkJson =
      '{"version":3,"wallet_db":{"offchain_next_derivation_index":2}}'
    const incomingSdkJson =
      '{"version":3,"wallet_db":{"offchain_next_derivation_index":3}}'
    const payload = basePayload()
    payload.arkadeAccounts = [
      {
        ...legacyAccount,
        operatorSignerPkHex: '02newsigner',
        sdkPersistenceJson: existingSdkJson,
      },
    ]
    payload.activeArkadeAccountIdByNetwork.signet = 'conn-1'

    const merged = mergeSdkPersistenceIntoPayload(
      payload,
      'conn-1',
      incomingSdkJson,
      '2026-06-28T12:00:00.000Z',
    )

    const account = merged.arkadeAccounts[0]
    expect(account?.operatorSignerPkHex).toBe('02newsigner')
    expect(account?.sdkPersistenceJson).toBe(incomingSdkJson)
    expect(account?.lastSuccessfulOperatorSyncAt).toBe('2026-06-28T12:00:00.000Z')
  })
})
