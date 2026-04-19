import type { Kysely } from 'kysely'
import type { Database } from './schema'
import { SQLITE_FALSE, SQLITE_TRUE } from './schema'

/** True if any wallet row has `no_mnemonic_backup` set (blocks backup import until seeds are backed up). */
export async function anyWalletHasNoMnemonicBackupFlag(
  walletDb: Kysely<Database>,
): Promise<boolean> {
  const row = await walletDb
    .selectFrom('wallets')
    .select('wallet_id')
    .where('no_mnemonic_backup', '=', SQLITE_TRUE as unknown as boolean)
    .executeTakeFirst()
  return row != null
}

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
