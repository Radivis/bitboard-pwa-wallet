import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database as AppDatabase } from '../schema'
import { createTestDatabase } from '../test-helpers'
import {
  clearWalletNoMnemonicBackupFlag,
  noMnemonicBackupSettingsKey,
  setWalletNoMnemonicBackupFlag,
  walletHasNoMnemonicBackupFlag,
} from '../no-mnemonic-backup-settings'

describe('no-mnemonic-backup settings', () => {
  let walletDb: Kysely<AppDatabase>

  beforeEach(async () => {
    walletDb = await createTestDatabase()
  })

  afterEach(async () => {
    await walletDb.destroy()
  })

  it('setWalletNoMnemonicBackupFlag and walletHasNoMnemonicBackupFlag', async () => {
    expect(await walletHasNoMnemonicBackupFlag(walletDb, 1)).toBe(false)
    await setWalletNoMnemonicBackupFlag(walletDb, 1)
    expect(await walletHasNoMnemonicBackupFlag(walletDb, 1)).toBe(true)
    expect(noMnemonicBackupSettingsKey(1)).toBe('no_mnemonic_backup:1')
  })

  it('clearWalletNoMnemonicBackupFlag removes the flag', async () => {
    await setWalletNoMnemonicBackupFlag(walletDb, 2)
    expect(await walletHasNoMnemonicBackupFlag(walletDb, 2)).toBe(true)
    await clearWalletNoMnemonicBackupFlag(walletDb, 2)
    expect(await walletHasNoMnemonicBackupFlag(walletDb, 2)).toBe(false)
  })

  it('removing the settings row matches delete-wallet cleanup (no orphan flag)', async () => {
    const inserted = await walletDb
      .insertInto('wallets')
      .values({ name: 'Temp', created_at: new Date().toISOString() })
      .executeTakeFirstOrThrow()
    const walletId = Number(inserted.insertId)
    await setWalletNoMnemonicBackupFlag(walletDb, walletId)
    await walletDb
      .deleteFrom('settings')
      .where('key', '=', noMnemonicBackupSettingsKey(walletId))
      .execute()
    await walletDb.deleteFrom('wallets').where('wallet_id', '=', walletId).execute()
    expect(await walletHasNoMnemonicBackupFlag(walletDb, walletId)).toBe(false)
  })
})
