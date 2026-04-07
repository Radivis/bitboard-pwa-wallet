import type { Kysely } from 'kysely'
import type { Database } from './schema'

const NO_MNEMONIC_BACKUP_KEY_PREFIX = 'no_mnemonic_backup:'

const FLAG_VALUE = '1'

export function noMnemonicBackupSettingsKey(walletId: number): string {
  return `${NO_MNEMONIC_BACKUP_KEY_PREFIX}${walletId}`
}

export async function setWalletNoMnemonicBackupFlag(
  walletDb: Kysely<Database>,
  walletId: number,
): Promise<void> {
  const key = noMnemonicBackupSettingsKey(walletId)
  const existing = await walletDb
    .selectFrom('settings')
    .select('key')
    .where('key', '=', key)
    .executeTakeFirst()

  if (existing) {
    await walletDb
      .updateTable('settings')
      .set({ value: FLAG_VALUE })
      .where('key', '=', key)
      .execute()
  } else {
    await walletDb.insertInto('settings').values({ key, value: FLAG_VALUE }).execute()
  }
}

export async function clearWalletNoMnemonicBackupFlag(
  walletDb: Kysely<Database>,
  walletId: number,
): Promise<void> {
  await walletDb
    .deleteFrom('settings')
    .where('key', '=', noMnemonicBackupSettingsKey(walletId))
    .execute()
}

export async function walletHasNoMnemonicBackupFlag(
  walletDb: Kysely<Database>,
  walletId: number,
): Promise<boolean> {
  const row = await walletDb
    .selectFrom('settings')
    .select('value')
    .where('key', '=', noMnemonicBackupSettingsKey(walletId))
    .executeTakeFirst()
  return row !== undefined
}
