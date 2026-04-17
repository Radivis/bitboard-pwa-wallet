import type { Kysely } from 'kysely'
import {
  LAB_DEFAULT_BLOCK_WEIGHT_UNITS,
  LAB_DEFAULT_MINER_SUBSIDY_SATS,
} from '@/workers/lab-api'

/**
 * Lab simulator SQLite schema. Legacy lab DBs may still list INTEGER for boolean columns in PRAGMA table_info until recreated; behavior is unchanged.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations run over multiple DB shapes
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('blocks')
    .ifNotExists()
    .addColumn('block_hash', 'text', (col) => col.primaryKey())
    .addColumn('height', 'integer', (col) => col.notNull())
    .addColumn('block_data', 'text', (col) => col.notNull())
    .addColumn('created_at', 'text', (col) => col.notNull())
    .execute()

  await db.schema
    .createTable('utxos')
    .ifNotExists()
    .addColumn('utxo_id', 'integer', (col) => col.primaryKey().autoIncrement())
    .addColumn('txid', 'text', (col) => col.notNull())
    .addColumn('vout', 'integer', (col) => col.notNull()) // INDEX of the output vector in the transaction
    .addColumn('address', 'text', (col) => col.notNull())
    .addColumn('amount_sats', 'integer', (col) => col.notNull())
    .addColumn('script_pubkey_hex', 'text', (col) => col.notNull())
    .execute()

  await db.schema
    .createTable('lab_addresses')
    .ifNotExists()
    .addColumn('lab_address_id', 'integer', (col) => col.primaryKey().autoIncrement())
    .addColumn('address', 'text', (col) => col.notNull().unique())
    .addColumn('wif', 'text', (col) => col.notNull())
    .execute()

  await db.schema
    .createTable('lab_transactions')
    .ifNotExists()
    .addColumn('lab_transaction_id', 'integer', (col) => col.primaryKey().autoIncrement())
    .addColumn('txid', 'text', (col) => col.notNull())
    .addColumn('sender_lab_entity_id', 'integer', (col) => col)
    .addColumn('sender_wallet_id', 'integer', (col) => col)
    .addColumn('receiver_lab_entity_id', 'integer', (col) => col)
    .addColumn('receiver_wallet_id', 'integer', (col) => col)
    .execute()

  await db.schema
    .createTable('lab_address_owners')
    .ifNotExists()
    .addColumn('address', 'text', (col) => col.primaryKey())
    .addColumn('owner_type', 'text', (col) => col.notNull())
    .addColumn('wallet_id', 'integer', (col) => col)
    .addColumn('entity_name', 'text', (col) => col)
    .addColumn('lab_entity_id', 'integer', (col) => col)
    .execute()

  await db.schema
    .createTable('lab_mempool')
    .ifNotExists()
    .addColumn('mempool_id', 'integer', (col) => col.primaryKey().autoIncrement())
    .addColumn('signed_tx_hex', 'text', (col) => col.notNull())
    .addColumn('txid', 'text', (col) => col.notNull())
    .addColumn('sender_lab_entity_id', 'integer', (col) => col)
    .addColumn('sender_wallet_id', 'integer', (col) => col)
    .addColumn('receiver_lab_entity_id', 'integer', (col) => col)
    .addColumn('receiver_wallet_id', 'integer', (col) => col)
    .addColumn('fee_sats', 'integer', (col) => col.notNull())
    .addColumn('weight', 'integer', (col) => col)
    .addColumn('inputs_json', 'text', (col) => col.notNull())
    .addColumn('inputs_detail_json', 'text', (col) => col.notNull())
    .addColumn('outputs_detail_json', 'text', (col) => col.notNull())
    .execute()

  await db.schema
    .createTable('lab_tx_details')
    .ifNotExists()
    .addColumn('txid', 'text', (col) => col.primaryKey())
    .addColumn('block_height', 'integer', (col) => col.notNull())
    .addColumn('block_time', 'integer', (col) => col.notNull())
    .addColumn('inputs_json', 'text', (col) => col.notNull())
    .addColumn('outputs_json', 'text', (col) => col.notNull())
    .execute()

  await db.schema
    .createTable('lab_entities')
    .ifNotExists()
    .addColumn('lab_entity_id', 'integer', (col) => col.primaryKey().autoIncrement())
    .addColumn('entity_name', 'text', (col) => col)
    .addColumn('mnemonic', 'text', (col) => col.notNull())
    .addColumn('changeset_json', 'text', (col) => col.notNull())
    .addColumn('external_descriptor', 'text', (col) => col.notNull())
    .addColumn('internal_descriptor', 'text', (col) => col.notNull())
    .addColumn('network', 'text', (col) => col.notNull().defaultTo('regtest'))
    .addColumn('address_type', 'text', (col) => col.notNull().defaultTo('segwit'))
    .addColumn('account_id', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('created_at', 'text', (col) => col.notNull())
    .addColumn('updated_at', 'text', (col) => col.notNull())
    .addColumn('is_dead', 'boolean', (col) => col.notNull().defaultTo(false))
    .execute()

  await db.schema
    .createIndex('lab_entities_entity_name_unique')
    .ifNotExists()
    .on('lab_entities')
    .column('entity_name')
    .unique()
    .execute()

  await db.schema
    .createTable('lab_mine_operations')
    .ifNotExists()
    .addColumn('mine_operation_id', 'integer', (col) => col.primaryKey().autoIncrement())
    .addColumn('height', 'integer', (col) => col.notNull())
    .addColumn('block_hash', 'text', (col) => col.notNull())
    .addColumn('mined_by_key', 'text', (col) => col)
    .addColumn('mined_by_lab_entity_id', 'integer', (col) => col)
    .addColumn('mined_by_wallet_id', 'integer', (col) => col)
    .addColumn('coinbase_txid', 'text', (col) => col)
    .addColumn('created_at', 'text', (col) => col.notNull())
    .addColumn('block_weight_limit_wu', 'integer', (col) => col)
    .addColumn('non_coinbase_weight_used_wu', 'integer', (col) => col)
    .execute()

  await db.schema
    .createTable('lab_tx_operations')
    .ifNotExists()
    .addColumn('tx_operation_id', 'integer', (col) => col.primaryKey().autoIncrement())
    .addColumn('txid', 'text', (col) => col.notNull().unique())
    .addColumn('sender_key', 'text', (col) => col.notNull())
    .addColumn('sender_lab_entity_id', 'integer', (col) => col)
    .addColumn('sender_wallet_id', 'integer', (col) => col)
    .addColumn('change_address', 'text', (col) => col)
    .addColumn('change_vout', 'integer', (col) => col)
    .addColumn('payload_json', 'text', (col) => col.notNull())
    .execute()

  await db.schema
    .createTable('lab_parameter_presets')
    .ifNotExists()
    .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement())
    .addColumn('block_size', 'integer', (col) => col.notNull())
    .addColumn('miner_subsidy_sats', 'integer', (col) => col.notNull())
    .execute()

  const existingPreset = await db.selectFrom('lab_parameter_presets').select('id').executeTakeFirst()
  if (!existingPreset) {
    await db
      .insertInto('lab_parameter_presets')
      .values({
        block_size: LAB_DEFAULT_BLOCK_WEIGHT_UNITS,
        miner_subsidy_sats: LAB_DEFAULT_MINER_SUBSIDY_SATS,
      })
      .execute()
  }
}
