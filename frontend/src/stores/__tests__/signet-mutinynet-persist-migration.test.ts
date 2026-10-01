import { describe, expect, it } from 'vitest'
import { migrateLightningPersistedState } from '@/stores/lightningStore'
import { migrateWalletPersistedState } from '@/stores/walletStore'

describe('migrateWalletPersistedState', () => {
  it('moves version 0 signet to mutinynet when that chain was Mutinynet', () => {
    expect(
      migrateWalletPersistedState({ networkMode: 'signet' }, 0, 'mutinynet'),
    ).toEqual({ networkMode: 'mutinynet' })
  })

  it('keeps version 0 signet when the chain was public signet or a custom host', () => {
    expect(
      migrateWalletPersistedState({ networkMode: 'signet' }, 0, 'public-signet'),
    ).toEqual({ networkMode: 'signet' })
    expect(
      migrateWalletPersistedState({ networkMode: 'signet' }, 0, 'custom-host'),
    ).toEqual({ networkMode: 'signet' })
  })

  it('does not rewrite signet once the persisted version is current', () => {
    expect(
      migrateWalletPersistedState({ networkMode: 'signet' }, 1, 'mutinynet'),
    ).toEqual({ networkMode: 'signet' })
  })
})

describe('migrateLightningPersistedState', () => {
  const persistedState = {
    activeConnectionIds: { '4': { signet: 'conn-signet', mainnet: 'conn-main' } },
    invoices: [{ paymentHash: 'abc' }],
  }

  it('renames the signet connection once when the chain was Mutinynet', () => {
    expect(migrateLightningPersistedState(persistedState, 0, 'mutinynet')).toEqual({
      activeConnectionIds: {
        '4': { mutinynet: 'conn-signet', mainnet: 'conn-main' },
      },
      invoices: [{ paymentHash: 'abc' }],
    })
  })

  it('keeps the signet connection for public signet and custom hosts', () => {
    expect(migrateLightningPersistedState(persistedState, 0, 'public-signet')).toBe(
      persistedState,
    )
    expect(migrateLightningPersistedState(persistedState, 0, 'custom-host')).toBe(
      persistedState,
    )
  })

  it('does not rename again at the current version', () => {
    expect(migrateLightningPersistedState(persistedState, 1, 'mutinynet')).toBe(
      persistedState,
    )
  })
})
