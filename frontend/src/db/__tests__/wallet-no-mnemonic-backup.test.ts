import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database as AppDatabase } from '../schema'
import { createTestDatabase } from '../test-helpers'
import {
  clearWalletNoMnemonicBackupFlag,
  setWalletNoMnemonicBackupFlag,
  walletHasNoMnemonicBackupFlag,
} from '../wallet-no-mnemonic-backup'

describe('no-mnemonic-backup flag on wallets', () => {
  let walletDb: Kysely<AppDatabase>

  beforeEach(async () => {
    walletDb = await createTestDatabase()
  })

  afterEach(async () => {
    await walletDb.destroy()
  })

  it('setWalletNoMnemonicBackupFlag and walletHasNoMnemonicBackupFlag', async () => {
    const inserted = await walletDb
      .insertInto('wallets')
      .values({ name: 'W1', created_at: new Date().toISOString() })
      .executeTakeFirstOrThrow()
    const walletId = Number(inserted.insertId)
    expect(await walletHasNoMnemonicBackupFlag(walletDb, walletId)).toBe(false)
    await setWalletNoMnemonicBackupFlag(walletDb, walletId)
    expect(await walletHasNoMnemonicBackupFlag(walletDb, walletId)).toBe(true)
    const row = await walletDb
      .selectFrom('wallets')
      .select('no_mnemonic_backup')
      .where('wallet_id', '=', walletId)
      .executeTakeFirst()
    expect(row != null && row.no_mnemonic_backup == true).toBe(true)
  })

  it('clearWalletNoMnemonicBackupFlag removes the flag', async () => {
    const inserted = await walletDb
      .insertInto('wallets')
      .values({ name: 'W2', created_at: new Date().toISOString() })
      .executeTakeFirstOrThrow()
    const walletId = Number(inserted.insertId)
    await setWalletNoMnemonicBackupFlag(walletDb, walletId)
    expect(await walletHasNoMnemonicBackupFlag(walletDb, walletId)).toBe(true)
    await clearWalletNoMnemonicBackupFlag(walletDb, walletId)
    expect(await walletHasNoMnemonicBackupFlag(walletDb, walletId)).toBe(false)
  })

  it('deleting wallet row clears flag lookup (no orphan state)', async () => {
    const inserted = await walletDb
      .insertInto('wallets')
      .values({ name: 'Temp', created_at: new Date().toISOString() })
      .executeTakeFirstOrThrow()
    const walletId = Number(inserted.insertId)
    await setWalletNoMnemonicBackupFlag(walletDb, walletId)
    expect(await walletHasNoMnemonicBackupFlag(walletDb, walletId)).toBe(true)
    await walletDb.deleteFrom('wallets').where('wallet_id', '=', walletId).execute()
    expect(await walletHasNoMnemonicBackupFlag(walletDb, walletId)).toBe(false)
  })
})
