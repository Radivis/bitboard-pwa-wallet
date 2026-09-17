import type { Kysely } from 'kysely'
import type { Database } from '@/db/schema'
import {
  clearNearZeroSecuritySettings,
  isNearZeroSecurityConfiguredInDb,
} from '@/db/near-zero-security'
import { endWalletSecretsSessionReliably } from '@/lib/wallet/wallet-secrets-session'

/**
 * First-run create/import can start a secrets session (password or near-zero)
 * before any wallet exists. Leaving setup without persisting a wallet should
 * unlock that choice again.
 */
export async function abandonFirstRunAppPasswordChoiceIfNoWallets(
  walletDb: Kysely<Database>,
): Promise<void> {
  const existingWallet = await walletDb
    .selectFrom('wallets')
    .select('wallet_id')
    .executeTakeFirst()

  if (existingWallet != null) {
    return
  }

  if (await isNearZeroSecurityConfiguredInDb(walletDb)) {
    await clearNearZeroSecuritySettings(walletDb)
  }
  await endWalletSecretsSessionReliably()
}
