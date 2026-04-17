import type { Kysely } from 'kysely'
import type { Database } from './schema'
import { SQLITE_FALSE, SQLITE_TRUE } from './schema'

export async function setWalletNoMnemonicBackupFlag(
  walletDb: Kysely<Database>,
  walletId: number,
): Promise<void> {
  await walletDb
    .updateTable('wallets')
    .set({ no_mnemonic_backup: SQLITE_TRUE })
    .where('wallet_id', '=', walletId)
    .execute()
}

export async function clearWalletNoMnemonicBackupFlag(
  walletDb: Kysely<Database>,
  walletId: number,
): Promise<void> {
  await walletDb
    .updateTable('wallets')
    .set({ no_mnemonic_backup: SQLITE_FALSE })
    .where('wallet_id', '=', walletId)
    .execute()
}

export async function walletHasNoMnemonicBackupFlag(
  walletDb: Kysely<Database>,
  walletId: number,
): Promise<boolean> {
  const row = await walletDb
    .selectFrom('wallets')
    .select('no_mnemonic_backup')
    .where('wallet_id', '=', walletId)
    .executeTakeFirst()
  return row != null && row.no_mnemonic_backup == true
}
