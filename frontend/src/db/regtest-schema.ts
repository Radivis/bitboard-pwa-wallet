import type { Generated, Insertable, Selectable, Updateable } from 'kysely'

interface RegtestAddressOwnersTable {
  address: string
  owner: string
}

interface RegtestMempoolTable {
  mempool_id: Generated<number>
  signed_tx_hex: string
  txid: string
  sender: string | null
  receiver: string | null
  fee_sats: number
  inputs_json: string
  inputs_detail_json: string
  outputs_detail_json: string
}

interface RegtestTransactionsTable {
  regtest_transaction_id: Generated<number>
  txid: string
  sender: string | null
  receiver: string | null
}

interface RegtestTxDetailsTable {
  txid: string
  block_height: number
  block_time: number
  inputs_json: string
  outputs_json: string
}

export interface RegtestDatabase {
  blocks: BlocksTable
  utxos: UtxosTable
  regtest_addresses: RegtestAddressesTable
  regtest_address_owners: RegtestAddressOwnersTable
  regtest_mempool: RegtestMempoolTable
  regtest_transactions: RegtestTransactionsTable
  regtest_tx_details: RegtestTxDetailsTable
}

interface BlocksTable {
  block_hash: string
  height: number
  block_data: string
  created_at: string
}

export type Block = Selectable<BlocksTable>
export type NewBlock = Insertable<BlocksTable>
export type BlockUpdate = Updateable<BlocksTable>

interface UtxosTable {
  utxo_id: Generated<number>
  txid: string
  vout: number
  address: string
  amount_sats: number
  script_pubkey_hex: string
}

export type Utxo = Selectable<UtxosTable>
export type NewUtxo = Insertable<UtxosTable>
export type UtxoUpdate = Updateable<UtxosTable>

interface RegtestAddressesTable {
  regtest_address_id: Generated<number>
  address: string
  wif: string
}

export type RegtestAddress = Selectable<RegtestAddressesTable>
export type NewRegtestAddress = Insertable<RegtestAddressesTable>
export type RegtestAddressUpdate = Updateable<RegtestAddressesTable>
