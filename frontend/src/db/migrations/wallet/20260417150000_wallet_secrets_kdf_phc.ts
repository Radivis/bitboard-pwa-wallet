import type { Kysely } from 'kysely'
import { sql } from 'kysely'
import {
  ARGON2_KDF_PHC_CI,
  ARGON2_KDF_PHC_PRODUCTION,
} from '@/lib/kdf-phc-constants'

/**
 * Replaces `kdf_version` / `mnemonic_kdf_version` with explicit Argon2id PHC parameter strings.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations run over multiple DB shapes
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('wallet_secrets')
    .addColumn('kdf_phc', 'text')
    .execute()

  await db.schema
    .alterTable('wallet_secrets')
    .addColumn('mnemonic_kdf_phc', 'text')
    .execute()

  await sql`
    UPDATE wallet_secrets
    SET kdf_phc = CASE kdf_version
      WHEN 1 THEN ${ARGON2_KDF_PHC_CI}
      ELSE ${ARGON2_KDF_PHC_PRODUCTION}
    END,
    mnemonic_kdf_phc = CASE mnemonic_kdf_version
      WHEN 1 THEN ${ARGON2_KDF_PHC_CI}
      ELSE ${ARGON2_KDF_PHC_PRODUCTION}
    END
  `.execute(db)

  await db.schema.alterTable('wallet_secrets').dropColumn('kdf_version').execute()
  await db.schema.alterTable('wallet_secrets').dropColumn('mnemonic_kdf_version').execute()
}
